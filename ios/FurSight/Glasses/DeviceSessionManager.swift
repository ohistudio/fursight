//
// DeviceSessionManager.swift
// FurSight (from Lisso-iOS, which adapted Meta's CameraAccess sample)
//
// Manages DeviceSession lifecycle with 1:1 device-to-session mapping,
// adapted from Meta's CameraAccess sample. Sessions are created on demand
// via getSession(), which waits for the session to reach .started.
//

import MWDATCore
import Observation
import SwiftUI

@Observable
@MainActor
final class DeviceSessionManager {
  private(set) var isReady: Bool = false
  private(set) var hasActiveDevice: Bool = false

  private let wearables: WearablesInterface
  private let deviceSelector: AutoDeviceSelector
  private var deviceSession: DeviceSession?
  @ObservationIgnored private var deviceMonitorTask: Task<Void, Never>?
  @ObservationIgnored private var stateObserverTask: Task<Void, Never>?

  init(wearables: WearablesInterface) {
    self.wearables = wearables
    self.deviceSelector = AutoDeviceSelector(wearables: wearables)
    startDeviceMonitoring()
  }

  func stopCurrentSession() {
    stateObserverTask?.cancel()
    stateObserverTask = nil
    deviceSession?.stop()
    deviceSession = nil
    isReady = false
  }

  /// Returns a ready DeviceSession, creating one if needed.
  func getSession() async throws -> DeviceSession {
    if let session = deviceSession, session.state == .started {
      isReady = true
      return session
    }

    if deviceSession?.state == .stopped {
      deviceSession = nil
    }

    // Wait for an in-progress session to finish starting.
    if let session = deviceSession {
      if session.state == .started {
        isReady = true
        startStateObserver(for: session)
        return session
      }
      try await waitForSessionStart(
        stateStream: session.stateStream(),
        errorStream: session.errorStream()
      )
      isReady = true
      startStateObserver(for: session)
      return session
    }

    // Create a new session.
    do {
      let session = try wearables.createSession(deviceSelector: deviceSelector)
      deviceSession = session

      let stateStream = session.stateStream()
      let errorStream = session.errorStream()
      try session.start()

      // The session may reach .started before the for-await loop begins
      // (stateStream does not buffer past events).
      if session.state == .started {
        isReady = true
        startStateObserver(for: session)
        return session
      }

      try await waitForSessionStart(stateStream: stateStream, errorStream: errorStream)
      isReady = true
      startStateObserver(for: session)
      return session
    } catch {
      isReady = false
      deviceSession = nil
      throw error
    }
  }

  // MARK: - Private

  private func waitForSessionStart(
    stateStream: AsyncStream<DeviceSessionState>,
    errorStream: AsyncStream<DeviceSessionError>
  ) async throws {
    try await withThrowingTaskGroup(of: Void.self) { group in
      group.addTask {
        for await state in stateStream {
          if state == .started { return }
          if state == .stopped {
            throw DeviceSessionError.unexpectedError(description: "The session failed to start")
          }
        }
        guard !Task.isCancelled else { return }
        throw DeviceSessionError.unexpectedError(description: "The session failed to start")
      }

      group.addTask {
        for await error in errorStream {
          throw error
        }
        guard !Task.isCancelled else { return }
        throw DeviceSessionError.unexpectedError(description: "The session failed to start")
      }

      guard try await group.next() != nil else {
        throw DeviceSessionError.unexpectedError(description: "The session failed to start")
      }
      group.cancelAll()
    }
  }

  /// Monitors device availability only — session creation is deferred to
  /// getSession() to avoid races.
  private func startDeviceMonitoring() {
    deviceMonitorTask = Task { [weak self] in
      guard let self else { return }
      for await device in deviceSelector.activeDeviceStream() {
        hasActiveDevice = device != nil
      }
    }
  }

  private func startStateObserver(for session: DeviceSession) {
    stateObserverTask?.cancel()
    stateObserverTask = Task { [weak self] in
      for await state in session.stateStream() {
        guard let self else { return }
        if state == .started {
          isReady = true
        } else if state == .stopped {
          // DeviceSession.stopped is terminal — clean up.
          isReady = false
          deviceSession = nil
          return
        }
      }
    }
  }
}
