import { useCallback, useState } from 'react';
import { storage } from '../utils/storage';

export interface GeneratedTask {
  title: string;
  notes?: string;
  estimatedDays?: number;
  priority?: 'high' | 'medium' | 'low';
}

export function useAiTaskGenerator() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const generateTasksFromDiary = useCallback(async (diaryContent: string): Promise<GeneratedTask[]> => {
    setLoading(true);
    setError(null);
    try {
      const settings = storage.getAiSettings();
      const deepseekKey = settings.deepseekKey;
      const deepseekBase = settings.deepseekBaseUrl || 'https://api.deepseek.com';
      const deepseekModel = settings.deepseekModel || 'deepseek-chat';

      if (!deepseekKey) {
        throw new Error('DeepSeek API key not configured');
      }

      const endpoint = `${deepseekBase.replace(/\/$/, '')}/v1/chat/completions`;
      const systemPrompt = `你是一个任务规划助手。分析用户提供的日记或计划文本，识别出所有需要执行的具体任务。
对于每个任务，提供：
1. 清晰的任务标题
2. 任务描述或说明
3. 估计的所需天数
4. 优先级（high/medium/low）

返回 JSON 数组，格式如下（最多生成10个任务）：
[
  {
    "title": "任务标题",
    "notes": "任务描述和详细说明",
    "estimatedDays": 预计天数,
    "priority": "high|medium|low"
  }
]

只返回 JSON 数组，不要有其他文本。`;

      const userPrompt = `请分析以下日记内容，识别并列出所有需要执行的具体任务。尽可能细致地切分任务，使每个任务都具有清晰的范围和可执行性。

日记内容：
${diaryContent}`;

      const payload = {
        model: deepseekModel,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt },
        ],
        temperature: 0.5,
        max_tokens: 2000,
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
        const errorData = await res.json().catch(() => ({}));
        throw new Error(`DeepSeek API error: ${res.status} - ${errorData?.error?.message || 'Unknown error'}`);
      }

      const data = await res.json();
      const textContent = data?.choices?.[0]?.message?.content || '';

      // Parse JSON from response
      const jsonMatch = textContent.match(/\[\s*\{[\s\S]*\}\s*\]/);
      if (!jsonMatch) {
        throw new Error('Invalid response format from DeepSeek');
      }

      const tasks: GeneratedTask[] = JSON.parse(jsonMatch[0]);
      
      // Validate and normalize tasks
      const validTasks = tasks
        .filter(task => task.title && typeof task.title === 'string')
        .slice(0, 10)
        .map(task => ({
          title: task.title.trim(),
          notes: task.notes ? String(task.notes).trim() : undefined,
          estimatedDays: task.estimatedDays ? Math.max(1, Math.min(365, parseInt(String(task.estimatedDays), 10))) : undefined,
          priority: ['high', 'medium', 'low'].includes(String(task.priority)) ? (task.priority as 'high' | 'medium' | 'low') : 'medium',
        }));

      setLoading(false);
      return validTasks;
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      setError(message);
      setLoading(false);
      throw err;
    }
  }, []);

  return { generateTasksFromDiary, loading, error } as const;
}
