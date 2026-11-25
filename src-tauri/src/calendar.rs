//! 只读 Mac 日历。日历是唯一能改日程的地方，Glimmer 只把某一天的安排显示在日记上方，
//! 不写回日历，也不写进日记正文。
//!
//! EventKit 直接在 Glimmer 进程里调用：系统的日历权限按「谁在读」记账，
//! 另起一个编译出来的小程序去读，权限会记到那个小程序头上，Glimmer 本身永远拿不到。

use serde::Serialize;

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CalendarEvent {
    id: String,
    title: String,
    start_ms: f64,
    end_ms: f64,
    all_day: bool,
    calendar_title: String,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CalendarEventsResult {
    /// authorized / denied / restricted / not-determined / unsupported
    status: String,
    events: Vec<CalendarEvent>,
}

#[cfg(target_os = "macos")]
mod mac {
    use super::{CalendarEvent, CalendarEventsResult};
    use block2::RcBlock;
    use objc2::runtime::Bool;
    use objc2_event_kit::{EKAuthorizationStatus, EKCalendarType, EKEntityType, EKEventStore};
    use objc2_foundation::{NSDate, NSError};
    use std::sync::mpsc;
    use std::time::Duration;

    fn status_label(status: EKAuthorizationStatus) -> &'static str {
        match status {
            EKAuthorizationStatus::FullAccess => "authorized",
            EKAuthorizationStatus::Denied => "denied",
            EKAuthorizationStatus::Restricted => "restricted",
            // 只写权限读不到事件，对这个功能等于没授权。
            EKAuthorizationStatus::WriteOnly => "denied",
            _ => "not-determined",
        }
    }

    /// 第一次调用时弹系统授权框。等他点完再往下走，最多等两分钟。
    fn request_access(store: &EKEventStore) -> bool {
        let (tx, rx) = mpsc::channel::<bool>();
        let block = RcBlock::new(move |granted: Bool, _error: *mut NSError| {
            let _ = tx.send(granted.as_bool());
        });
        unsafe { store.requestFullAccessToEventsWithCompletion(RcBlock::as_ptr(&block)) };
        rx.recv_timeout(Duration::from_secs(120)).unwrap_or(false)
    }

    pub fn events_between(start_ms: f64, end_ms: f64) -> CalendarEventsResult {
        let mut status = unsafe { EKEventStore::authorizationStatusForEntityType(EKEntityType::Event) };
        let store = unsafe { EKEventStore::new() };

        if status == EKAuthorizationStatus::NotDetermined {
            request_access(&store);
            status = unsafe { EKEventStore::authorizationStatusForEntityType(EKEntityType::Event) };
        }

        let label = status_label(status);
        if label != "authorized" {
            return CalendarEventsResult { status: label.to_string(), events: Vec::new() };
        }

        let start = NSDate::dateWithTimeIntervalSince1970(start_ms / 1000.0);
        let end = NSDate::dateWithTimeIntervalSince1970(end_ms / 1000.0);
        let predicate =
            unsafe { store.predicateForEventsWithStartDate_endDate_calendars(&start, &end, None) };
        let found = unsafe { store.eventsMatchingPredicate(&predicate) };

        let mut events: Vec<CalendarEvent> = found
            .iter()
            .filter_map(|event| unsafe {
                let calendar = event.calendar()?;
                // 节假日、生日这类订阅日历不是他的安排，显示出来只是噪音。
                let kind = calendar.r#type();
                if kind == EKCalendarType::Subscription || kind == EKCalendarType::Birthday {
                    return None;
                }
                Some(CalendarEvent {
                    id: event
                        .eventIdentifier()
                        .map(|id| id.to_string())
                        .unwrap_or_else(|| event.calendarItemIdentifier().to_string()),
                    title: event.title().to_string(),
                    start_ms: event.startDate().timeIntervalSince1970() * 1000.0,
                    end_ms: event.endDate().timeIntervalSince1970() * 1000.0,
                    all_day: event.isAllDay(),
                    calendar_title: calendar.title().to_string(),
                })
            })
            .collect();

        // 全天的排前面，其余按开始时间。
        events.sort_by(|a, b| {
            b.all_day
                .cmp(&a.all_day)
                .then(a.start_ms.partial_cmp(&b.start_ms).unwrap_or(std::cmp::Ordering::Equal))
        });

        CalendarEventsResult { status: "authorized".to_string(), events }
    }
}

/// 读 [start_ms, end_ms) 之间的日历事件。第一次调用会弹系统授权框。
#[tauri::command]
pub async fn calendar_events(start_ms: f64, end_ms: f64) -> Result<CalendarEventsResult, String> {
    // 授权框要等他点，不能卡在主线程上。
    tauri::async_runtime::spawn_blocking(move || {
        #[cfg(target_os = "macos")]
        {
            mac::events_between(start_ms, end_ms)
        }
        #[cfg(not(target_os = "macos"))]
        {
            let _ = (start_ms, end_ms);
            CalendarEventsResult { status: "unsupported".to_string(), events: Vec::new() }
        }
    })
    .await
    .map_err(|err| err.to_string())
}
