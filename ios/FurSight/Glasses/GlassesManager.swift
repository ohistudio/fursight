//
// GlassesManager.swift
// FurSight
//
// Ray-Ban Display through the Device Access Toolkit: one session with a warm camera stream and the display.
// "Can he eat this?" from the glasses: tap the button on the lens (or Check this on the phone), the latest
// camera frame goes through FoodCheck, and the verdict for the food you're holding shows on the lens with
// "We fed him this". The phone's Food check shows the same frame with a label on each food.
//
// Session, stream and display plumbing from Lisso-iOS (DAT 1.0.1, with the display restart from Meta's
// BirdSpotter sample); the screens and the check are FurSight's own.
//

import MWDATCamera
import MWDATCore
import MWDATDisplay
import Observation
import SwiftUI

@Observable
@MainActor
final class GlassesManager {
  static let shared = GlassesManager(wearables: Wearables.shared)

  enum Phase: Equatable { case idle, starting, ready, checking }

  var phase: Phase = .idle
  var isStreaming = false
  var currentFrame: UIImage?
  var errorMessage: String?
  var requiresDATAppUpdate = false
  var streamStateLabel = "not started"
  var displayStatus = "not attached"
  /// The last check made from the glasses, so the phone can show it with labels.
  var lastResult: FoodCheck.Result? { didSet { results += 1 } }
  var results = 0

  var hasActiveDevice: Bool { sessionManager.hasActiveDevice }

  private let wearables: WearablesInterface
  private let sessionManager: DeviceSessionManager

  @ObservationIgnored private var session: DeviceSession?
  @ObservationIgnored private var camera: MWDATCamera.Camera?
  @ObservationIgnored private var stream: MWDATCamera.Stream?
  @ObservationIgnored private var display: Display?
  @ObservationIgnored private var displayReady = false
  @ObservationIgnored private var displayRestartAttempts = 0
  @ObservationIgnored private var pendingDisplayAction: (() async -> Void)?
  @ObservationIgnored private var waitingForFrame = false
  @ObservationIgnored private var streamTimeoutTask: Task<Void, Never>?
  @ObservationIgnored private var lastFrameConvert = Date.distantPast

  @ObservationIgnored private var streamStateToken: AnyListenerToken?
  @ObservationIgnored private var videoFrameToken: AnyListenerToken?
  @ObservationIgnored private var streamErrorToken: AnyListenerToken?
  @ObservationIgnored private var displayStateToken: AnyListenerToken?

  init(wearables: WearablesInterface) {
    self.wearables = wearables
    self.sessionManager = DeviceSessionManager(wearables: wearables)
  }

  // MARK: - Session

  func start() async {
    guard phase == .idle else { return }
    phase = .starting
    errorMessage = nil
    do {
      var status = try await wearables.checkPermissionStatus(.camera)
      if status != .granted { status = try await wearables.requestPermission(.camera) }
      guard status == .granted else {
        errorMessage = "Camera permission was denied on the glasses."
        phase = .idle
        return
      }
      let newSession = try await sessionManager.getSession()
      session = newSession
      try startDisplay(on: newSession)
      // keep the camera warm for the whole session: joining the glasses' Wi-Fi is the slow part, pay it once
      try startStream(on: newSession)
      requiresDATAppUpdate = false
      phase = .ready
      UIApplication.shared.isIdleTimerDisabled = true   // auto-lock would suspend us and drop the session
      await FoodCheck.loadPet()
      await sendHome()
    } catch DeviceSessionError.datAppOnTheGlassesUpdateRequired {
      requiresDATAppUpdate = true
      errorMessage = "The app on your glasses needs an update before the session can start."
      stopInternal()
    } catch {
      errorMessage = "Could not start the glasses: \(error.localizedDescription)"
      stopInternal()
    }
  }

  func stop() { stopInternal() }

  func openDATGlassesAppUpdate() {
    Task { do { try await wearables.openDATGlassesAppUpdate() } catch { errorMessage = error.localizedDescription } }
  }

  private func stopInternal() {
    streamTimeoutTask?.cancel(); streamTimeoutTask = nil
    waitingForFrame = false
    stream?.stop(); stream = nil
    camera?.stop(); camera = nil
    display?.stop(); display = nil
    displayReady = false
    pendingDisplayAction = nil
    streamStateToken = nil; videoFrameToken = nil; streamErrorToken = nil; displayStateToken = nil
    sessionManager.stopCurrentSession()
    session = nil
    isStreaming = false
    currentFrame = nil
    streamStateLabel = "not started"
    phase = .idle
    UIApplication.shared.isIdleTimerDisabled = false
  }

  // MARK: - Camera

  private func startStream(on session: DeviceSession) throws {
    let config = StreamConfiguration(videoCodec: VideoCodec.raw, resolution: StreamingResolution.high, frameRate: 24)
    guard let newCamera = try session.addCamera(config: config) else {
      throw DeviceSessionError.unexpectedError(description: "Unable to start the glasses camera")
    }
    camera = newCamera
    let newStream = newCamera.stream
    stream = newStream
    streamStateToken = newStream.statePublisher.listen { [weak self] state in
      Task { @MainActor in self?.handleStreamState(state) }
    }
    videoFrameToken = newStream.videoFramePublisher.listen { [weak self] frame in
      Task { @MainActor in
        guard let self else { return }
        // ~6 fps for the phone preview (converting every frame on the main actor trips the suspend watchdog);
        // a check that's waiting takes the next frame straight away
        if !self.waitingForFrame, Date().timeIntervalSince(self.lastFrameConvert) < 0.16 { return }
        self.lastFrameConvert = Date()
        guard let image = frame.makeUIImage() else { return }
        self.currentFrame = image
        if self.waitingForFrame { self.waitingForFrame = false; self.runCheck(image) }
      }
    }
    streamErrorToken = newStream.errorPublisher.listen { [weak self] error in
      Task { @MainActor in self?.errorMessage = error.localizedDescription }
    }
    newStream.start()
  }

  private func handleStreamState(_ state: StreamState) {
    switch state {
    case .streaming: isStreaming = true; streamStateLabel = "streaming"
    case .stopped:
      isStreaming = false; currentFrame = nil; streamStateLabel = "stopped"
      stream = nil; camera?.stop(); camera = nil
      streamStateToken = nil; videoFrameToken = nil; streamErrorToken = nil
      if phase != .idle, let session { try? startStream(on: session) }
    case .waitingForDevice: isStreaming = false; streamStateLabel = "waiting for the glasses"
    case .starting: isStreaming = false; streamStateLabel = "starting"
    case .stopping: isStreaming = false; streamStateLabel = "stopping"
    case .paused: isStreaming = false; streamStateLabel = "paused"
    }
  }

  // MARK: - Display

  private func startDisplay(on session: DeviceSession) throws {
    let capability = try session.addDisplay()
    display = capability
    displayStateToken = capability.statePublisher.listen { [weak self] state in
      Task { @MainActor in self?.handleDisplayState(state) }
    }
    capability.start()
  }

  private func handleDisplayState(_ state: DisplayState) {
    NSLog("[FurSightDisplay] state=\(state)")
    displayStatus = String(describing: state)
    switch state {
    case .starting, .stopping: break
    case .started:
      displayReady = true
      displayRestartAttempts = 0
      if let action = pendingDisplayAction { pendingDisplayAction = nil; Task { await action() } }
      else if phase == .ready { Task { await sendHome() } }
    case .stopped:
      displayReady = false
      // the display can drop to .stopped while the camera brings up its link; start() works on a stopped one
      guard phase != .idle, let display, displayRestartAttempts < 10 else { display = nil; return }
      displayRestartAttempts += 1
      Task { @MainActor in
        try? await Task.sleep(for: .seconds(1.5))
        guard self.phase != .idle, self.display != nil else { return }
        display.start()
      }
    }
  }

  private func send(_ view: some DisplayableView) async {
    guard let display else { return }
    if displayReady {
      do { try await display.send(view) } catch { errorMessage = "Display error: \(error.localizedDescription)" }
      return
    }
    let queued = view
    pendingDisplayAction = { [weak self] in
      guard let self, let display = self.display else { return }
      do { try await display.send(queued) } catch { self.errorMessage = "Display error: \(error.localizedDescription)" }
    }
  }

  private func sendHome() async {
    await send(FurSightDisplay.home(pet: FoodCheck.petName, onCheck: { [weak self] in Task { @MainActor in self?.check() } }))
  }

  // MARK: - "Can he eat this?"

  /// From the lens button or the phone: check what the glasses camera sees now.
  func check() {
    guard phase == .ready else { return }
    phase = .checking
    Task { await send(FurSightDisplay.checking(pet: FoodCheck.petName)) }
    if let frame = currentFrame { runCheck(frame) }
    else {
      waitingForFrame = true
      streamTimeoutTask?.cancel()
      streamTimeoutTask = Task { [weak self] in
        try? await Task.sleep(for: .seconds(20))
        guard let self, !Task.isCancelled, self.waitingForFrame else { return }
        self.waitingForFrame = false
        self.fail("The glasses camera didn't start (\(self.streamStateLabel)).")
      }
    }
  }

  private func runCheck(_ image: UIImage) {
    streamTimeoutTask?.cancel(); streamTimeoutTask = nil
    Task { @MainActor in
      do {
        let r = try await FoodCheck.run(image)
        lastResult = r
        phase = .ready
        await showVerdict(r)
      } catch {
        fail(error.localizedDescription)
      }
    }
  }

  /// The verdict for the food being held (the phone may call this after its own check).
  func showVerdict(_ r: FoodCheck.Result) async {
    guard phase != .idle else { return }
    guard r.items.indices.contains(r.held) else {
      await send(FurSightDisplay.message("No food seen", "Hold it up in front of you and try again.", onAgain: { [weak self] in Task { @MainActor in self?.check() } }))
      return
    }
    let item = r.items[r.held]
    await send(FurSightDisplay.verdict(item, pet: FoodCheck.petName, others: r.items.count - 1,
      onFed: { [weak self] in Task { @MainActor in await self?.fed(item) } },
      onAgain: { [weak self] in Task { @MainActor in self?.check() } }))
  }

  private func fed(_ item: [String: Any]) async {
    do {
      let (said, _) = try await FoodCheck.fed(item)
      await send(FurSightDisplay.message("Marked", said, onAgain: { [weak self] in Task { @MainActor in self?.check() } }))
    } catch {
      fail(error.localizedDescription)
    }
  }

  private func fail(_ message: String) {
    phase = .ready
    errorMessage = message
    Task { await send(FurSightDisplay.message("Couldn't check", message, onAgain: { [weak self] in Task { @MainActor in self?.check() } })) }
  }
}
