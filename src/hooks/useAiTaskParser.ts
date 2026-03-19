import { useCallback, useState } from 'react';
import { storage } from '../utils/storage';
import { parsePlansLocal } from '../utils/planParser';
import type { ParsedPlanItem } from '../utils/planParser';

const GEMINI_ENDPOINT = 'https://api.gemini.google.com/v1/complete';

type ParsedPlanResponse = {
  tasks: Array<{
    title?: string;
    notes?: string;
    date?: string;
    startDate?: string;
    endDate?: string;
  }>;
};

const normalizeDateString = (value: string | undefined, reference: Date) => {
  if (!value) return null;
  const text = value.trim();
  if (!text) return null;

  const buildTimestamp = (year: number, month: number, day: number) => {
    const date = new Date(year, month - 1, day);
    if (
      Number.isNaN(date.getTime()) ||
      date.getFullYear() !== year ||
      date.getMonth() !== month - 1 ||
      date.getDate() !== day
    ) {
      return null;
    }
    date.setHours(0, 0, 0, 0);
    return date.getTime();
  };

  const ymdMatch = text.match(/^(\d{4})[年./-](\d{1,2})[月./-](\d{1,2})日?$/);
  if (ymdMatch) {
    return buildTimestamp(Number(ymdMatch[1]), Number(ymdMatch[2]), Number(ymdMatch[3]));
  }

  const mdMatch = text.match(/^(\d{1,2})[月./-](\d{1,2})日?$/);
  if (mdMatch) {
    return buildTimestamp(reference.getFullYear(), Number(mdMatch[1]), Number(mdMatch[2]));
  }

  const date = new Date(text);
  if (Number.isNaN(date.getTime())) return null;
  date.setHours(0, 0, 0, 0);
  return date.getTime();
};

const toEndOfDay = (timestamp: number | null) => {
  if (timestamp === null) return null;
  const date = new Date(timestamp);
  date.setHours(23, 59, 59, 999);
  return date.getTime();
};

const fromAiResponse = (data: ParsedPlanResponse, reference: Date): ParsedPlanItem[] => {
  if (!data || !Array.isArray(data.tasks)) {
    return [];
  }

  return data.tasks
    .map((task) => {
      const title = (task.title || '').trim();
      if (!title) return null;

      const startDate = normalizeDateString(task.startDate || task.date, reference) || null;
      const endDateRaw = normalizeDateString(task.endDate || task.date, reference) || startDate;
      const endDate = toEndOfDay(endDateRaw);

      if (!startDate || !endDate) {
        return {
          title,
          notes: task.notes?.trim() || undefined,
          startDate: null,
          endDate: null,
          source: 'ai',
        } as ParsedPlanItem;
      }

      return {
        title,
        notes: task.notes?.trim() || undefined,
        startDate,
        endDate,
        source: 'ai',
      } as ParsedPlanItem;
    })
    .filter((task): task is ParsedPlanItem => Boolean(task))
    .map((task) => ({
      ...task,
      startDate: task.startDate ?? null,
      endDate: task.endDate ?? null,
      source: task.source || 'ai',
    }));
};

export function useAiTaskParser() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const parsePlans = useCallback(async (text: string, reference: Date) => {
    setLoading(true);
    setError(null);

    const settings = storage.getAiSettings();
    const geminiKey = settings.geminiApiKey;
    const deepseekKey = settings.deepseekKey;
    const deepseekBase = settings.deepseekBaseUrl || 'https://api.deepseek.com';
    const deepseekModel = settings.deepseekModel || 'deepseek-chat';

    try {
      if (deepseekKey) {
        try {
          const endpoint = `${deepseekBase.replace(/\/$/, '')}/v1/chat/completions`;
          const systemPrompt = `你是一个中文计划解析助手。用户会提供日程或计划文本（可能包含多个任务）。
          
你必须返回一个JSON对象，格式如下：
{
  "tasks": [
    {
      "title": "任务标题",
      "notes": "任务描述（可选）",
      "date": "单天日期用此字段，优先YYYY-MM-DD，也可MM-DD或M月D日",
      "startDate": "时间段用此字段，优先YYYY-MM-DD，也可MM-DD或M月D日",
      "endDate": "时间段结束日期，优先YYYY-MM-DD，也可MM-DD或M月D日"
    }
  ]
}

重要规则：
1. 返回一个完整的JSON对象，包含tasks数组（可能包含多个任务）
2. 如果是单天任务，填写date字段
3. 如果是多天任务，填写startDate和endDate
4. 日期不明确时，所有日期字段可留空字符串
5. 只返回JSON，不要有其他文本
6. 未给出年份时可不写年份，系统会按参考日期所在年份补全
7. 确保输出是有效的JSON格式`;
          const payload = {
            model: deepseekModel,
            messages: [
              {
                role: 'system',
                content: systemPrompt,
              },
              { role: 'user', content: `请分析以下计划文本并提取所有任务：\n\n${text}` },
            ],
            temperature: 0.3,
            max_tokens: 1500,
          };

          const res = await fetch(endpoint, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${deepseekKey}`,
            },
            body: JSON.stringify(payload),
          });

          if (!res.ok) {
            throw new Error(`DeepSeek API error: ${res.status}`);
          }

          const data = await res.json();
          const textOut = data?.choices?.[0]?.message?.content || data?.choices?.[0]?.text || '';
          
          // Try to extract JSON - be more flexible with whitespace
          let parsed: ParsedPlanResponse | null = null;
          
          // First try: direct JSON parse if it's valid
          try {
            parsed = JSON.parse(textOut) as ParsedPlanResponse;
          } catch {
            // Second try: extract JSON object from text
            const jsonMatch = textOut.match(/\{[\s\S]*\}/);
            if (jsonMatch) {
              try {
                parsed = JSON.parse(jsonMatch[0]) as ParsedPlanResponse;
              } catch {
                console.warn('Failed to parse extracted JSON:', jsonMatch[0]);
              }
            }
          }
          
          if (parsed && Array.isArray(parsed.tasks)) {
            const tasks = fromAiResponse(parsed, reference);
            if (tasks.length > 0) {
              setLoading(false);
              return tasks;
            }
          }
        } catch (apiErr) {
          console.warn('DeepSeek plan parse failed, falling back to Gemini or local', apiErr);
        }
      }

      if (geminiKey) {
        try {
          const systemPrompt = `你是一个中文计划解析助手。用户会提供日程或计划文本。请返回一个JSON对象：
{
  "tasks": [
    {"title": "任务", "notes": "描述", "date": "YYYY-MM-DD 或 MM-DD", "startDate": "YYYY-MM-DD 或 MM-DD", "endDate": "YYYY-MM-DD 或 MM-DD"}
  ]
}
只返回JSON，如果是单天填date，多天填startDate和endDate；未提供年份时可只写MM-DD。`;
          const prompt = `${systemPrompt}\n\n计划文本：\n${text}`;
          const res = await fetch(GEMINI_ENDPOINT, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${geminiKey}`,
            },
            body: JSON.stringify({
              prompt,
              temperature: 0.2,
              max_output_tokens: 800,
            }),
          });

          if (!res.ok) {
            throw new Error(`Gemini API error: ${res.status}`);
          }

          const data = await res.json();
          const textOut = data?.choices?.[0]?.text || data?.output || '';
          
          // Try to extract JSON - be more flexible with whitespace
          let parsed: ParsedPlanResponse | null = null;
          
          // First try: direct JSON parse if it's valid
          try {
            parsed = JSON.parse(textOut) as ParsedPlanResponse;
          } catch {
            // Second try: extract JSON object from text
            const jsonMatch = textOut.match(/\{[\s\S]*\}/);
            if (jsonMatch) {
              try {
                parsed = JSON.parse(jsonMatch[0]) as ParsedPlanResponse;
              } catch {
                console.warn('Failed to parse extracted JSON:', jsonMatch[0]);
              }
            }
          }
          
          if (parsed && Array.isArray(parsed.tasks)) {
            const tasks = fromAiResponse(parsed, reference);
            if (tasks.length > 0) {
              setLoading(false);
              return tasks;
            }
          }
        } catch (apiErr) {
          console.warn('Gemini plan parse failed, falling back to local', apiErr);
        }
      }

      const localTasks = parsePlansLocal(text, reference).map((item) => ({
        ...item,
        source: 'local',
      }));
      setLoading(false);
      return localTasks;
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      setError(message);
      setLoading(false);
      throw err;
    }
  }, []);

  return { parsePlans, loading, error } as const;
}
