import AppKit
import ApplicationServices
import Vision

func output(_ value: [String: Any]) {
    let data = try! JSONSerialization.data(withJSONObject: value)
    print(String(data: data, encoding: .utf8)!)
}
func reject(_ message: String) -> Never { output(["error": message]); exit(1) }
let input = FileHandle.standardInput.readDataToEndOfFile()
guard let body = try? JSONSerialization.jsonObject(with: input) as? [String: Any], let action = body["action"] as? String else { reject("Invalid action") }
// Ground word selection in pixels actually present in the captured image.
// Vision boxes use a bottom-left origin; guide coordinates use top-left.
if action == "locate_word" {
    guard let encoded = body["image"] as? String, encoded.count <= 4000000,
          let data = Data(base64Encoded: encoded), let image = NSImage(data: data),
          let cgImage = image.cgImage(forProposedRect: nil, context: nil, hints: nil),
          let word = body["word"] as? String, !word.isEmpty, word.count <= 120 else { reject("Invalid word-selection image.") }
    let request = VNRecognizeTextRequest()
    request.recognitionLevel = .accurate
    request.usesLanguageCorrection = false
    do { try VNImageRequestHandler(cgImage: cgImage, options: [:]).perform([request]) }
    catch { reject("Could not locate the word in the screenshot. Refresh the step.") }
    var matches: [[String: Double]] = []
    for observation in request.results ?? [] {
        guard let candidate = observation.topCandidates(1).first else { continue }
        let text = candidate.string
        var search = text.startIndex..<text.endIndex
        while let range = text.range(of: word, options: [.caseInsensitive, .diacriticInsensitive], range: search) {
            let before = range.lowerBound == text.startIndex ? nil : text[text.index(before: range.lowerBound)]
            let after = range.upperBound == text.endIndex ? nil : text[range.upperBound]
            if !(before?.isLetter ?? false) && !(before?.isNumber ?? false) && !(after?.isLetter ?? false) && !(after?.isNumber ?? false),
               let box = try? candidate.boundingBox(for: range) {
                let rect = box.boundingBox
                matches.append(["x": rect.midX, "y": 1-rect.midY])
            }
            if range.upperBound == text.endIndex { break }
            search = range.upperBound..<text.endIndex
        }
    }
    output(["matches": matches]); exit(0)
}
let front = NSWorkspace.shared.frontmostApplication
if action == "status" {
    var target = Int(front?.processIdentifier ?? 0)
    if let owner = body["ownerPid"] as? Int, target == owner,
       let windows = CGWindowListCopyWindowInfo([.optionOnScreenOnly, .excludeDesktopElements], kCGNullWindowID) as? [[String: Any]] {
        for window in windows {
            guard let pid = window[kCGWindowOwnerPID as String] as? Int, pid != owner,
                  (window[kCGWindowLayer as String] as? Int) == 0,
                  let raw = window[kCGWindowBounds as String] as? NSDictionary,
                  let bounds = CGRect(dictionaryRepresentation: raw), bounds.width > 100, bounds.height > 100 else { continue }
            if let display = body["display"] as? [String: Double],
               let x = display["x"], let y = display["y"], let w = display["width"], let h = display["height"],
               !bounds.intersects(CGRect(x: x, y: y, width: w, height: h)) { continue }
            target = pid; break
        }
    }
    // Accessibility inspection and permission to post input are separate checks.
    output(["pid": target, "trusted": AXIsProcessTrusted() && CGPreflightPostEventAccess()]); exit(0)
}
if action == "restore" {
    guard let pid = body["pid"] as? Int, pid > 0, pid <= Int(Int32.max),
          let owner = body["ownerPid"] as? Int,
          let active = front, Int(active.processIdentifier) == owner || Int(active.processIdentifier) == pid else { reject("The active app changed. Get a fresh step.") }
    if Int(active.processIdentifier) != pid {
        guard let target = NSRunningApplication(processIdentifier: pid_t(pid)), target.activate(options: []) else { reject("Bring the target app forward and get a fresh step.") }
        let deadline = Date().addingTimeInterval(1)
        while NSWorkspace.shared.frontmostApplication?.processIdentifier != pid_t(pid) && Date() < deadline { RunLoop.current.run(until: Date().addingTimeInterval(0.02)) }
    }
    guard NSWorkspace.shared.frontmostApplication?.processIdentifier == pid_t(pid) else { reject("Bring the target app forward and get a fresh step.") }
    output(["ok": true]); exit(0)
}
guard AXIsProcessTrusted() else { reject("Allow Acumen / Electron in macOS Accessibility settings, then try again.") }
guard CGPreflightPostEventAccess() else { reject("macOS is blocking mouse and keyboard input. Enable Acumen / Electron in Accessibility, then refresh the step.") }
guard let pid = body["pid"] as? Int, pid > 0, Int(front?.processIdentifier ?? 0) == pid else { reject("The active app changed. Get a fresh step.") }
let bundle = front?.bundleIdentifier ?? ""
if ["com.apple.Terminal", "com.googlecode.iterm2", "com.apple.systempreferences"].contains(bundle) { reject("Complete this step yourself, then ask for the next step.") }
if action == "locate_control" {
    guard let label = body["label"] as? String, !label.isEmpty, label.count <= 120 else { reject("Invalid control label.") }
    let normalized = label.trimmingCharacters(in: .whitespacesAndNewlines).lowercased()
    func matchesLabel(_ element: AXUIElement) -> Bool {
        for attribute in [kAXTitleAttribute, kAXDescriptionAttribute, kAXPlaceholderValueAttribute] {
            var value: CFTypeRef?
            AXUIElementCopyAttributeValue(element, attribute as CFString, &value)
            if let string = value as? String, string.trimmingCharacters(in: .whitespacesAndNewlines).lowercased() == normalized { return true }
        }
        // HTML <label for> names are exposed as a related AX title element.
        var title: CFTypeRef?
        if AXUIElementCopyAttributeValue(element, kAXTitleUIElementAttribute as CFString, &title) == .success,
           let title = title, CFGetTypeID(title) == AXUIElementGetTypeID() {
            for attribute in [kAXValueAttribute, kAXTitleAttribute, kAXDescriptionAttribute] {
                var value: CFTypeRef?
                AXUIElementCopyAttributeValue(title as! AXUIElement, attribute as CFString, &value)
                if let string = value as? String, string.trimmingCharacters(in: .whitespacesAndNewlines).lowercased() == normalized { return true }
            }
        }
        return false
    }
    let root = AXUIElementCreateApplication(pid_t(pid))
    var window: CFTypeRef?
    AXUIElementCopyAttributeValue(root, kAXFocusedWindowAttribute as CFString, &window)
    var queue: [AXUIElement] = []
    if let window = window, CFGetTypeID(window) == AXUIElementGetTypeID() { queue.append(window as! AXUIElement) }
    var index = 0
    var matches: [[String: Double]] = []
    let deadline = Date().addingTimeInterval(2)
    let roles: Set<String> = body["kind"] as? String == "text"
        ? ["AXTextField", "AXTextArea", "AXComboBox"]
        : ["AXButton", "AXPopUpButton", "AXMenuItem", "AXCheckBox", "AXRadioButton", "AXCell", "AXTab", "AXComboBox"]
    while index < queue.count && index < 7000 && Date() < deadline {
        let element = queue[index]; index += 1
        var role: CFTypeRef?, subrole: CFTypeRef?
        AXUIElementCopyAttributeValue(element, kAXRoleAttribute as CFString, &role)
        AXUIElementCopyAttributeValue(element, kAXSubroleAttribute as CFString, &subrole)
        if roles.contains(role as? String ?? "") && subrole as? String != "AXSecureTextField" {
            if matchesLabel(element) {
                var rawPosition: CFTypeRef?, rawSize: CFTypeRef?
                AXUIElementCopyAttributeValue(element, kAXPositionAttribute as CFString, &rawPosition)
                AXUIElementCopyAttributeValue(element, kAXSizeAttribute as CFString, &rawSize)
                var position = CGPoint.zero, size = CGSize.zero
                if let p = rawPosition, let s = rawSize, CFGetTypeID(p) == AXValueGetTypeID(), CFGetTypeID(s) == AXValueGetTypeID(),
                   AXValueGetValue(p as! AXValue, .cgPoint, &position), AXValueGetValue(s as! AXValue, .cgSize, &size), size.width > 0, size.height > 0 {
                    let center = CGPoint(x: position.x+size.width/2, y: position.y+size.height/2)
                    // Browser AX trees also retain closed palettes. Require the
                    // actual element under this point to carry the same label.
                    var hit: AXUIElement?
                    var visible = false
                    if AXUIElementCopyElementAtPosition(AXUIElementCreateSystemWide(), Float(center.x), Float(center.y), &hit) == .success {
                        var candidate = hit
                        for _ in 0..<5 {
                            guard let current = candidate else { break }
                            var owner: pid_t = 0
                            guard AXUIElementGetPid(current, &owner) == .success, Int(owner) == pid else { break }
                            visible = matchesLabel(current)
                            if visible { break }
                            var parent: CFTypeRef?
                            guard AXUIElementCopyAttributeValue(current, kAXParentAttribute as CFString, &parent) == .success,
                                  let parent = parent, CFGetTypeID(parent) == AXUIElementGetTypeID() else { break }
                            candidate = (parent as! AXUIElement)
                        }
                    }
                    if visible { matches.append(["x": center.x, "y": center.y]) }
                }
            }
        }
        var children: CFTypeRef?
        if AXUIElementCopyAttributeValue(element, kAXChildrenAttribute as CFString, &children) == .success,
           let children = children as? [AXUIElement] { queue.append(contentsOf: children.prefix(max(0,7000-queue.count))) }
    }
    output(["matches": matches]); exit(0)
}
guard ["click", "double_click", "type", "scroll"].contains(action), let x = body["x"] as? Double, let y = body["y"] as? Double, x.isFinite, y.isFinite else { reject("Invalid action") }
let point = CGPoint(x: x, y: y)
guard NSScreen.screens.contains(where: { screen in
    let primaryHeight = NSScreen.screens.first?.frame.height ?? 0
    let f = screen.frame
    return CGRect(x: f.minX, y: primaryHeight-f.maxY, width: f.width, height: f.height).contains(point)
}) else { reject("The display changed. Get a fresh step.") }
let source = CGEventSource(stateID: .hidSystemState)
var typed: String? = nil
if action == "type" {
    guard let text = body["text"] as? String, !text.isEmpty, text.count <= 300, text.unicodeScalars.allSatisfy({ !CharacterSet.controlCharacters.contains($0) }) else { reject("Invalid text") }
    var element: AXUIElement?
    guard AXUIElementCopyElementAtPosition(AXUIElementCreateSystemWide(), Float(x), Float(y), &element) == .success, let field = element else { reject("Cannot verify this text field. Type it yourself.") }
    // Rich editors can hit-test to a text child inside the editable field.
    var candidate = field
    var verified = false
    for _ in 0..<6 {
        var owner: pid_t = 0
        guard AXUIElementGetPid(candidate, &owner) == .success, Int(owner) == pid else { break }
        var role: CFTypeRef?, subrole: CFTypeRef?
        AXUIElementCopyAttributeValue(candidate, kAXRoleAttribute as CFString, &role)
        AXUIElementCopyAttributeValue(candidate, kAXSubroleAttribute as CFString, &subrole)
        if subrole as? String == "AXSecureTextField" { reject("Secure fields must be filled manually.") }
        if ["AXTextField", "AXTextArea", "AXComboBox"].contains(role as? String ?? "") { verified = true; break }
        var parent: CFTypeRef?
        guard AXUIElementCopyAttributeValue(candidate, kAXParentAttribute as CFString, &parent) == .success,
              let parent = parent, CFGetTypeID(parent) == AXUIElementGetTypeID() else { break }
        candidate = (parent as! AXUIElement)
    }
    guard verified else { reject("This is not a verified ordinary text field. Type it yourself.") }
    typed = text
}
CGEvent(mouseEventSource: source, mouseType: .mouseMoved, mouseCursorPosition: point, mouseButton: .left)?.post(tap: .cghidEventTap)
if action == "scroll" {
    guard let direction = body["direction"] as? String, ["up", "down"].contains(direction) else { reject("Invalid scroll direction") }
    CGEvent(scrollWheelEvent2Source: source, units: .pixel, wheelCount: 1, wheel1: direction == "down" ? -350 : 350, wheel2: 0, wheel3: 0)?.post(tap: .cghidEventTap)
} else {
    for count in 1...(action == "double_click" ? 2 : 1) {
        guard let down = CGEvent(mouseEventSource: source, mouseType: .leftMouseDown, mouseCursorPosition: point, mouseButton: .left),
              let up = CGEvent(mouseEventSource: source, mouseType: .leftMouseUp, mouseCursorPosition: point, mouseButton: .left) else { reject("Could not create mouse input.") }
        down.setIntegerValueField(.mouseEventClickState, value: Int64(count))
        up.setIntegerValueField(.mouseEventClickState, value: Int64(count))
        down.post(tap: .cghidEventTap)
        Thread.sleep(forTimeInterval: 0.04)
        up.post(tap: .cghidEventTap)
        Thread.sleep(forTimeInterval: 0.06)
    }
    if let text = typed {
        // Text is inserted literally, without shortcuts, Return, or clipboard access.
        let chars = Array(text.utf16)
        let event = CGEvent(keyboardEventSource: source, virtualKey: 0, keyDown: true)
        chars.withUnsafeBufferPointer { buffer in event?.keyboardSetUnicodeString(stringLength: chars.count, unicodeString: buffer.baseAddress!) }
        event?.post(tap: .cghidEventTap)
        CGEvent(keyboardEventSource: source, virtualKey: 0, keyDown: false)?.post(tap: .cghidEventTap)
    }
}
output(["ok": true])
