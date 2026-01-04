import Foundation
import CoreLocation
import Combine
import AVFoundation

@MainActor
class NavigationViewModel: ObservableObject {
    @Published var isNavigating = false
    @Published var currentRoute: Route?
    @Published var alternativeRoutes: [Route] = []
    @Published var selectedTransportMode: TransportMode = .car
    @Published var currentStepIndex = 0
    @Published var distanceToNextStep: Double = 0
    @Published var isLoadingRoute = false
    @Published var error: Error?
    @Published var isVoiceEnabled = true
    @Published var estimatedArrival: Date?
    @Published var remainingDistance: Double = 0
    @Published var remainingDuration: Double = 0

    private let osrmService = OSRMService.shared
    private var locationCancellable: AnyCancellable?
    private let speechSynthesizer = AVSpeechSynthesizer()
    private var lastSpokenInstruction: String?
    private var announcedSteps: Set<Int> = []

    init() {
        configureAudioSession()
    }

    private func configureAudioSession() {
        do {
            try AVAudioSession.sharedInstance().setCategory(.playback, mode: .voicePrompt, options: [.duckOthers, .interruptSpokenAudioAndMixWithOthers])
            try AVAudioSession.sharedInstance().setActive(true)
        } catch {
            print("Failed to configure audio session: \(error)")
        }
    }

    var currentStep: RouteStep? {
        guard let route = currentRoute,
              currentStepIndex < route.steps.count else {
            return nil
        }
        return route.steps[currentStepIndex]
    }

    var nextStep: RouteStep? {
        guard let route = currentRoute,
              currentStepIndex + 1 < route.steps.count else {
            return nil
        }
        return route.steps[currentStepIndex + 1]
    }

    var progress: Double {
        guard let route = currentRoute else { return 0 }
        let totalSteps = route.steps.count
        guard totalSteps > 0 else { return 0 }
        return Double(currentStepIndex) / Double(totalSteps)
    }

    // MARK: - Route Calculation
    func calculateRoute(
        from origin: CLLocationCoordinate2D,
        to destination: Location
    ) async {
        await MainActor.run {
            isLoadingRoute = true
            error = nil
        }

        do {
            let routes = try await osrmService.getRoute(
                from: origin,
                to: destination.coordinate,
                mode: selectedTransportMode,
                alternatives: true
            )

            await MainActor.run {
                if let firstRoute = routes.first {
                    self.currentRoute = firstRoute
                    self.alternativeRoutes = Array(routes.dropFirst())
                    self.updateRemainingInfo()
                }
                self.isLoadingRoute = false
            }
        } catch {
            await MainActor.run {
                self.error = error
                self.isLoadingRoute = false
            }
        }
    }

    func selectAlternativeRoute(_ route: Route) {
        if let current = currentRoute {
            alternativeRoutes.append(current)
        }
        alternativeRoutes.removeAll { $0.id == route.id }
        currentRoute = route
        updateRemainingInfo()
    }

    // MARK: - Navigation Control
    func startNavigation(from location: CLLocation) {
        guard currentRoute != nil else { return }

        isNavigating = true
        currentStepIndex = 0
        announcedSteps = []
        updateRemainingInfo()

        // Announce first instruction
        if let step = currentStep {
            announceInstruction(step.instruction)
        }
    }

    func stopNavigation() {
        isNavigating = false
        currentRoute = nil
        alternativeRoutes = []
        currentStepIndex = 0
        announcedSteps = []
        speechSynthesizer.stopSpeaking(at: .immediate)
    }

    func pauseNavigation() {
        isNavigating = false
    }

    func resumeNavigation() {
        guard currentRoute != nil else { return }
        isNavigating = true
    }

    // MARK: - Location Updates
    func updateLocation(_ location: CLLocation) {
        guard isNavigating, let route = currentRoute else { return }

        // Find closest step
        var minDistance = Double.infinity
        var closestStepIndex = currentStepIndex

        for (index, step) in route.steps.enumerated() where index >= currentStepIndex {
            let stepLocation = CLLocation(
                latitude: step.coordinate.latitude,
                longitude: step.coordinate.longitude
            )
            let distance = location.distance(from: stepLocation)

            if distance < minDistance {
                minDistance = distance
                closestStepIndex = index
            }
        }

        // Update current step if we've moved to next
        if closestStepIndex > currentStepIndex {
            currentStepIndex = closestStepIndex
            updateRemainingInfo()

            // Announce new step
            if let step = currentStep, !announcedSteps.contains(currentStepIndex) {
                announceInstruction(step.instruction)
                announcedSteps.insert(currentStepIndex)
            }
        }

        // Calculate distance to next maneuver
        if let step = currentStep {
            let stepLocation = CLLocation(
                latitude: step.coordinate.latitude,
                longitude: step.coordinate.longitude
            )
            distanceToNextStep = location.distance(from: stepLocation)

            // Announce upcoming turn
            if distanceToNextStep < 100 && !announcedSteps.contains(currentStepIndex + 1000) {
                announceUpcomingTurn()
                announcedSteps.insert(currentStepIndex + 1000) // Use offset to track pre-announcements
            }
        }

        // Check if arrived
        if currentStepIndex >= route.steps.count - 1 && minDistance < 30 {
            announceInstruction("Vous etes arrive a destination")
            stopNavigation()
        }
    }

    // MARK: - Voice Guidance
    func announceInstruction(_ instruction: String) {
        guard isVoiceEnabled else { return }
        guard instruction != lastSpokenInstruction else { return }

        lastSpokenInstruction = instruction

        let utterance = AVSpeechUtterance(string: instruction)
        utterance.voice = AVSpeechSynthesisVoice(language: "fr-FR")
        utterance.rate = 0.5
        utterance.pitchMultiplier = 1.0
        utterance.volume = 1.0

        speechSynthesizer.stopSpeaking(at: .word)
        speechSynthesizer.speak(utterance)
    }

    private func announceUpcomingTurn() {
        guard let step = currentStep else { return }

        let distanceText: String
        if distanceToNextStep >= 1000 {
            distanceText = String(format: "Dans %.1f kilometres", distanceToNextStep / 1000)
        } else {
            distanceText = "Dans \(Int(distanceToNextStep)) metres"
        }

        let announcement = "\(distanceText), \(step.instruction)"
        announceInstruction(announcement)
    }

    func toggleVoice() {
        isVoiceEnabled.toggle()
        if !isVoiceEnabled {
            speechSynthesizer.stopSpeaking(at: .immediate)
        }
    }

    // MARK: - Helpers
    private func updateRemainingInfo() {
        guard let route = currentRoute else {
            remainingDistance = 0
            remainingDuration = 0
            estimatedArrival = nil
            return
        }

        // Calculate remaining from current step
        var remaining = 0.0
        var remainingTime = 0.0

        for (index, step) in route.steps.enumerated() where index >= currentStepIndex {
            remaining += step.distance
            remainingTime += step.duration
        }

        remainingDistance = remaining
        remainingDuration = remainingTime
        estimatedArrival = Date().addingTimeInterval(remainingTime)
    }

    var formattedRemainingDistance: String {
        if remainingDistance >= 1000 {
            return String(format: "%.1f km", remainingDistance / 1000)
        } else {
            return String(format: "%.0f m", remainingDistance)
        }
    }

    var formattedRemainingDuration: String {
        let hours = Int(remainingDuration) / 3600
        let minutes = (Int(remainingDuration) % 3600) / 60

        if hours > 0 {
            return "\(hours)h \(minutes)min"
        } else {
            return "\(minutes) min"
        }
    }

    var formattedArrivalTime: String {
        guard let arrival = estimatedArrival else { return "--:--" }
        let formatter = DateFormatter()
        formatter.timeStyle = .short
        return formatter.string(from: arrival)
    }
}
