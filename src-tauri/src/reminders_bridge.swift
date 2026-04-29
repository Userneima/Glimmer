import EventKit
import Foundation

struct ReminderCreatePayload: Decodable {
  let title: String
  let notes: String?
  let dueAt: Double?
  let sourceTaskId: String
  let sourceDiaryId: String?
  let sourceIdeaId: String?
}

struct ReminderCreateResult: Encodable {
  let externalId: String
  let calendarId: String?
  let calendarTitle: String?
}

struct ReminderFetchOptions: Decodable {
  let scope: String?
  let daysAhead: Int?
  let includeCompleted: Bool?
}

struct AppleReminder: Encodable {
  let externalId: String
  let title: String
  let notes: String?
  let dueAt: Double?
  let completed: Bool
  let calendarId: String?
  let calendarTitle: String?
  let priority: Int?
}

struct BridgeResponse: Encodable {
  let status: String?
  let result: ReminderCreateResult?
  let reminders: [AppleReminder]?
  let error: String?
}

func printResponse(_ response: BridgeResponse) {
  let data = try! JSONEncoder().encode(response)
  FileHandle.standardOutput.write(data)
}

func authorizationStatus() -> String {
  let status = EKEventStore.authorizationStatus(for: .reminder)
  switch status {
  case .notDetermined:
    return "not-determined"
  case .restricted:
    return "restricted"
  case .denied:
    return "denied"
  case .authorized:
    return "authorized"
  case .fullAccess:
    return "authorized"
  default:
    return "unsupported"
  }
}

func requestAccess(store: EKEventStore) -> String {
  let semaphore = DispatchSemaphore(value: 0)
  var granted = false

  if #available(macOS 14.0, *) {
    store.requestFullAccessToReminders { accessGranted, _ in
      granted = accessGranted
      semaphore.signal()
    }
  } else {
    store.requestAccess(to: .reminder) { accessGranted, _ in
      granted = accessGranted
      semaphore.signal()
    }
  }

  _ = semaphore.wait(timeout: .now() + 60)
  return granted ? "authorized" : authorizationStatus()
}

func preferredCalendar(store: EKEventStore) -> EKCalendar? {
  let writableCalendars = store.calendars(for: .reminder).filter { $0.allowsContentModifications }
  if let existing = writableCalendars.first(where: { $0.title == "Glimmer" }) {
    return existing
  }

  if let defaultCalendar = store.defaultCalendarForNewReminders(), defaultCalendar.allowsContentModifications {
    let calendar = EKCalendar(for: .reminder, eventStore: store)
    calendar.title = "Glimmer"
    calendar.source = defaultCalendar.source
    do {
      try store.saveCalendar(calendar, commit: true)
      return calendar
    } catch {
      return defaultCalendar
    }
  }

  return writableCalendars.first
}

func createReminder(store: EKEventStore, payload: ReminderCreatePayload) throws -> ReminderCreateResult {
  guard authorizationStatus() == "authorized" else {
    throw NSError(domain: "GlimmerReminders", code: 1, userInfo: [NSLocalizedDescriptionKey: "Reminders permission is not authorized."])
  }
  guard let calendar = preferredCalendar(store: store) else {
    throw NSError(domain: "GlimmerReminders", code: 2, userInfo: [NSLocalizedDescriptionKey: "No writable Reminders list is available."])
  }

  let reminder = EKReminder(eventStore: store)
  reminder.title = payload.title
  reminder.notes = payload.notes
  reminder.calendar = calendar

  if let dueAt = payload.dueAt {
    let date = Date(timeIntervalSince1970: dueAt / 1000)
    reminder.dueDateComponents = Calendar.current.dateComponents([.year, .month, .day, .hour, .minute], from: date)
    reminder.addAlarm(EKAlarm(absoluteDate: date))
  }

  try store.save(reminder, commit: true)
  return ReminderCreateResult(
    externalId: reminder.calendarItemIdentifier,
    calendarId: calendar.calendarIdentifier,
    calendarTitle: calendar.title
  )
}

func reminderDisplayDate(_ reminder: EKReminder) -> Date? {
  return reminder.dueDateComponents?.date ?? reminder.startDateComponents?.date
}

func fetchReminders(store: EKEventStore, options: ReminderFetchOptions) throws -> [AppleReminder] {
  guard authorizationStatus() == "authorized" else {
    throw NSError(domain: "GlimmerReminders", code: 1, userInfo: [NSLocalizedDescriptionKey: "Reminders permission is not authorized."])
  }

  let calendars = store.calendars(for: .reminder)
  let predicate = store.predicateForReminders(in: calendars)
  let semaphore = DispatchSemaphore(value: 0)
  var fetched: [EKReminder] = []

  store.fetchReminders(matching: predicate) { reminders in
    fetched = reminders ?? []
    semaphore.signal()
  }

  _ = semaphore.wait(timeout: .now() + 60)

  let now = Date()
  let calendar = Calendar.current
  let startOfToday = calendar.startOfDay(for: now)
  let daysAhead = options.daysAhead ?? 30
  let endDate = calendar.date(byAdding: .day, value: daysAhead, to: startOfToday) ?? now
  let includeCompleted = options.includeCompleted ?? false

  let mapped = fetched
    .filter { reminder in
      if !includeCompleted && reminder.isCompleted {
        return false
      }

      guard let dueDate = reminderDisplayDate(reminder) else {
        return options.scope == "all-open"
      }

      if options.scope == "today" {
        return calendar.isDate(dueDate, inSameDayAs: now)
      }

      return dueDate >= startOfToday && dueDate <= endDate
    }
    .sorted { left, right in
      let leftDate = reminderDisplayDate(left) ?? Date.distantFuture
      let rightDate = reminderDisplayDate(right) ?? Date.distantFuture
      if leftDate == rightDate {
        return left.title.localizedCompare(right.title) == .orderedAscending
      }
      return leftDate < rightDate
    }
    .map { reminder in
      AppleReminder(
        externalId: reminder.calendarItemIdentifier,
        title: reminder.title ?? "",
        notes: reminder.notes,
        dueAt: reminderDisplayDate(reminder).map { $0.timeIntervalSince1970 * 1000 },
        completed: reminder.isCompleted,
        calendarId: reminder.calendar.calendarIdentifier,
        calendarTitle: reminder.calendar.title,
        priority: reminder.priority
      )
    }

  if options.scope == "all-open" {
    return Array(mapped.prefix(80))
  }

  let undatedOpen = fetched
    .filter { reminder in
      !reminder.isCompleted && reminderDisplayDate(reminder) == nil
    }
    .sorted { left, right in
      left.title.localizedCompare(right.title) == .orderedAscending
    }
    .prefix(20)
    .map { reminder in
      AppleReminder(
        externalId: reminder.calendarItemIdentifier,
        title: reminder.title ?? "",
        notes: reminder.notes,
        dueAt: nil,
        completed: reminder.isCompleted,
        calendarId: reminder.calendar.calendarIdentifier,
        calendarTitle: reminder.calendar.title,
        priority: reminder.priority
      )
    }

  return mapped + undatedOpen
}

let command = CommandLine.arguments.dropFirst().first ?? ""
let store = EKEventStore()

do {
  switch command {
  case "status":
    printResponse(BridgeResponse(status: authorizationStatus(), result: nil, reminders: nil, error: nil))
  case "request_access":
    printResponse(BridgeResponse(status: requestAccess(store: store), result: nil, reminders: nil, error: nil))
  case "create":
    let input = FileHandle.standardInput.readDataToEndOfFile()
    let payload = try JSONDecoder().decode(ReminderCreatePayload.self, from: input)
    let result = try createReminder(store: store, payload: payload)
    printResponse(BridgeResponse(status: "authorized", result: result, reminders: nil, error: nil))
  case "fetch":
    let input = FileHandle.standardInput.readDataToEndOfFile()
    let options = input.isEmpty
      ? ReminderFetchOptions(scope: "upcoming", daysAhead: 30, includeCompleted: false)
      : try JSONDecoder().decode(ReminderFetchOptions.self, from: input)
    let reminders = try fetchReminders(store: store, options: options)
    printResponse(BridgeResponse(status: "authorized", result: nil, reminders: reminders, error: nil))
  default:
    printResponse(BridgeResponse(status: "unsupported", result: nil, reminders: nil, error: "Unsupported Reminders bridge command."))
  }
} catch {
  printResponse(BridgeResponse(status: authorizationStatus(), result: nil, reminders: nil, error: error.localizedDescription))
}
