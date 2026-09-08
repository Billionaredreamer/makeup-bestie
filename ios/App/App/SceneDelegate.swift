import UIKit
import Capacitor
import WebKit

class SceneDelegate: UIResponder, UIWindowSceneDelegate {
    var window: UIWindow?

    func scene(_ scene: UIScene, willConnectTo session: UISceneSession, options connectionOptions: UIScene.ConnectionOptions) {
        guard let windowScene = scene as? UIWindowScene else { return }

        window = UIWindow(windowScene: windowScene)
        window?.rootViewController = MakeupBridgeViewController()
        window?.makeKeyAndVisible()

        SceneDelegateProxy.shared.scene(scene, willConnectTo: session, options: connectionOptions)
    }

    func scene(_ scene: UIScene, openURLContexts URLContexts: Set<UIOpenURLContext>) {
        SceneDelegateProxy.shared.scene(scene, openURLContexts: URLContexts)
    }

    func scene(_ scene: UIScene, continue userActivity: NSUserActivity) {
        SceneDelegateProxy.shared.scene(scene, continue: userActivity)
    }
}

// Keep Capacitor's navigation delegate intact (including auth and purchase URLs).
// This watchdog also runs when the remote app cannot download any JavaScript.
private final class MakeupBridgeViewController: CAPBridgeViewController, WKScriptMessageHandler {
    private var launchTimeout: Timer?
    private var retryView: UIView?

    override func capacitorDidLoad() {
        super.capacitorDidLoad()
        let controller = webView?.configuration.userContentController
        controller?.add(WeakLaunchHandler(self), name: "makeupLaunch")
        let script = """
        (() => {
          const report = () => window.webkit.messageHandlers.makeupLaunch.postMessage({
            ready: document.documentElement.dataset.appReady === 'true',
            welcome: document.documentElement.dataset.welcome === 'true'
          });
          new MutationObserver(report).observe(document.documentElement, {
            attributes: true, attributeFilter: ['data-app-ready', 'data-welcome']
          });
          report();
        })();
        """
        controller?.addUserScript(WKUserScript(source: script, injectionTime: .atDocumentEnd, forMainFrameOnly: true))
        startWatchdog()
    }

    func userContentController(_ userContentController: WKUserContentController, didReceive message: WKScriptMessage) {
        guard message.frameInfo.isMainFrame,
              message.frameInfo.securityOrigin.host == "www.makeupbestie.app",
              let state = message.body as? [String: Bool] else { return }
        setStatusBarStyle(state["welcome"] == true ? .lightContent : .darkContent)
        if state["ready"] == true {
            launchTimeout?.invalidate()
            launchTimeout = nil
            retryView?.removeFromSuperview()
            retryView = nil
        }
    }

    private func startWatchdog() {
        launchTimeout?.invalidate()
        launchTimeout = Timer.scheduledTimer(withTimeInterval: 15, repeats: false) { [weak self] _ in
            self?.showRetry()
        }
    }

    private func showRetry() {
        guard retryView == nil else { return }
        webView?.stopLoading()
        setStatusBarStyle(.darkContent)
        let surface = UIView()
        surface.backgroundColor = UIColor(red: 1, green: 250/255, blue: 244/255, alpha: 1)
        surface.translatesAutoresizingMaskIntoConstraints = false
        view.addSubview(surface)
        NSLayoutConstraint.activate([
            surface.leadingAnchor.constraint(equalTo: view.leadingAnchor),
            surface.trailingAnchor.constraint(equalTo: view.trailingAnchor),
            surface.topAnchor.constraint(equalTo: view.topAnchor),
            surface.bottomAnchor.constraint(equalTo: view.bottomAnchor)
        ])
        retryView = surface
        let title = UILabel()
        title.text = "Let’s reconnect."
        title.font = UIFont(name: "Georgia", size: 32)
        title.textAlignment = .center
        title.numberOfLines = 0
        let detail = UILabel()
        detail.text = "Makeup Bestie couldn’t finish loading. Check your connection and try again."
        detail.numberOfLines = 0
        detail.textAlignment = .center
        detail.font = .preferredFont(forTextStyle: .body)
        let retry = UIButton(type: .system)
        retry.setTitle("Try again", for: .normal)
        retry.titleLabel?.font = .preferredFont(forTextStyle: .headline)
        retry.addTarget(self, action: #selector(retryLaunch), for: .touchUpInside)
        retry.heightAnchor.constraint(greaterThanOrEqualToConstant: 52).isActive = true
        let stack = UIStackView(arrangedSubviews: [title, detail, retry])
        stack.axis = .vertical
        stack.spacing = 20
        stack.translatesAutoresizingMaskIntoConstraints = false
        surface.addSubview(stack)
        let brown = UIColor(red: 56/255, green: 35/255, blue: 29/255, alpha: 1)
        title.textColor = brown
        detail.textColor = brown
        retry.tintColor = brown
        NSLayoutConstraint.activate([
            stack.centerYAnchor.constraint(equalTo: surface.safeAreaLayoutGuide.centerYAnchor),
            stack.leadingAnchor.constraint(equalTo: surface.safeAreaLayoutGuide.leadingAnchor, constant: 28),
            stack.trailingAnchor.constraint(equalTo: surface.safeAreaLayoutGuide.trailingAnchor, constant: -28)
        ])
        // Call the installed native plugin directly: no loaded JS is required.
        let call = CAPPluginCall(callbackId: "launch-timeout", methodName: "hide", options: ["fadeOutDuration": 0], success: { _, _ in }, error: { _ in })
        bridge?.plugin(withName: "SplashScreen")?.perform(NSSelectorFromString("hide:"), with: call)
        UIAccessibility.post(notification: .screenChanged, argument: title)
    }

    @objc private func retryLaunch() {
        retryView?.removeFromSuperview()
        retryView = nil
        loadWebView()
        startWatchdog()
    }

    deinit { launchTimeout?.invalidate() }
}

private final class WeakLaunchHandler: NSObject, WKScriptMessageHandler {
    weak var target: WKScriptMessageHandler?
    init(_ target: WKScriptMessageHandler) { self.target = target }
    func userContentController(_ userContentController: WKUserContentController, didReceive message: WKScriptMessage) {
        target?.userContentController(userContentController, didReceive: message)
    }
}
