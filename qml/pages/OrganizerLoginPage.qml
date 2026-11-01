import QtQuick 2.6
import Sailfish.Silica 1.0
import ru.auroraos.WebView 1.0
import "../components"

// Opens the server's tokenAuthUrl. The Jitsi sign-in page finishes by
// redirecting to https://<server>/<room>#jwt=<token>; that redirect is
// intercepted here and the token is handed to the call screen.
Page {
    id: page
    allowedOrientations: Orientation.All
    property string address
    property string serverAddress
    property var roomPage
    property var popups: []
    property bool done: false

    function tokenFrom(url) {
        var text = String(url)
        var server = page.serverAddress.replace(/\/$/, "")
        if (text.indexOf(server + "/") !== 0) return ""
        var match = text.match(/[#&]jwt=([^&]+)/)
        return match ? decodeURIComponent(match[1]) : ""
    }

    function check(url) {
        if (done) return
        var jwt = tokenFrom(url)
        if (!jwt) return
        done = true
        if (roomPage) roomPage.setToken(jwt)
        pageStack.pop(roomPage)
    }

    function showPopup(popup) {
        var list = popups.slice()
        list.push(popup)
        popups = list
        popup.parent = content
        popup.anchors.fill = content
        popup.visible = true
    }

    function closePopup(popup) {
        var list = popups.slice()
        var index = list.indexOf(popup)
        if (index < 0) return
        list.splice(index, 1)
        popups = list
        popup.destroy()
    }

    Rectangle { anchors.fill: parent; color: AppStyle.background }

    ScreenHeader {
        id: header
        title: qsTr("Я организатор")
        subtitle: String(page.popups.length ? page.popups[page.popups.length - 1].url : web.url).split("/").slice(0, 3).join("/")
        showBack: true
        onBackClicked: {
            if (page.popups.length) page.closePopup(page.popups[page.popups.length - 1])
            else pageStack.pop()
        }
    }

    Item {
        id: content
        anchors { top: header.bottom; bottom: parent.bottom; left: parent.left; right: parent.right }
        clip: true

        WebView {
            id: web
            anchors.fill: parent
            url: page.address
            // Identity providers refuse sign-in from unknown embedded browsers.
            userAgent: "Mozilla/5.0 (Linux; Android 13; Mobile) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Mobile Safari/537.36"
            TouchInput { enabled: true }
            KeyboardInput { enabled: true }
            onUrlChanged: page.check(url)
            PopupExtension {
                function beforePopup(address, frameName, userGesture) {
                    if (page.popups.length >= 3) return null
                    if (address.scheme !== "https" && !(address.scheme === "about" && address.path === "blank")) return null
                    return popupComponent
                }
                function popupReady(popup) { page.showPopup(popup) }
            }
        }
    }

    Component {
        id: popupComponent
        WebView {
            // Aurora loads the requested URL into this bound popup; assigning
            // url here would break window.opener used by the sign-in flow.
            TouchInput { enabled: true }
            KeyboardInput { enabled: true }
            onUrlChanged: page.check(url)
            onClosing: page.closePopup(this)
            PopupExtension {
                function beforePopup(address, frameName, userGesture) {
                    if (page.popups.length >= 3) return null
                    if (address.scheme !== "https" && !(address.scheme === "about" && address.path === "blank")) return null
                    return popupComponent
                }
                function popupReady(popup) { page.showPopup(popup) }
            }
        }
    }
}
