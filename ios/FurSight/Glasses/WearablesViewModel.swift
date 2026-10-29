//
// WearablesViewModel.swift
// FurSight (from Lisso-iOS)
//
// Tracks DAT SDK registration state and the list of known glasses.
//

import MWDATCore
import Observation
import SwiftUI

@Observable
@MainActor
final class WearablesViewModel {
  var registrationState: RegistrationState
  var deviceNames: [String] = []
  var showError: Bool = false
  var errorMessage: String = ""

  @ObservationIgnored private var registrationTask: Task<Void, Never>?
  @ObservationIgnored private var deviceStreamTask: Task<Void, Never>?
  let wearables: WearablesInterface

  init(wearables: WearablesInterface) {
    self.wearables = wearables
    self.registrationState = wearables.registrationState

    registrationTask = Task { [weak self] in
      guard let wearables = self?.wearables else { return }
      for await state in wearables.registrationStateStream() {
        guard let self else { return }
        self.registrationState = state
      }
    }

    deviceStreamTask = Task { [weak self] in
      guard let wearables = self?.wearables else { return }
      for await deviceIds in wearables.devicesStream() {
        guard let self else { return }
        self.deviceNames = deviceIds.compactMap { id in
          wearables.deviceForIdentifier(id)?.nameOrId()
        }
      }
    }
  }

  var registrationLabel: String {
    switch registrationState {
    case .registered: return "Connected to Meta AI"
    case .registering: return "Connecting…"
    case .available: return "Ready to connect"
    case .unavailable: return "Meta AI app not available"
    @unknown default: return "Unknown"
    }
  }

  func connectGlasses() async {
    guard registrationState != .registering else { return }
    do {
      try await wearables.startRegistration()
    } catch {
      showError(error.localizedDescription)
    }
  }

  func disconnectGlasses() async {
    do {
      try await wearables.startUnregistration()
    } catch {
      showError(error.localizedDescription)
    }
  }

  func showError(_ message: String) {
    errorMessage = message
    showError = true
  }

  func dismissError() {
    showError = false
  }
}
