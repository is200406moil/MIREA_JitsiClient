import QtQuick 2.6
import Sailfish.Silica 1.0
import Sailfish.WebView 1.0
import "../components"

// Opens the server's tokenAuthUrl (Aurora OS 5.1: the Gecko based Sailfish
// WebView). The Jitsi sign-in page finishes by redirecting to
// https://<server>/<room>#jwt=<token>; that redirect is intercepted here and
// the token is handed to the call screen.
Page {
    id: page
    allowedOrientations: Orientation.All
    property string address
    property string serverAddress
    property var roomPage
    property bool done: false

    function tokenFrom(url) {
        var text = String(url)
        var server = page.serverAddress.replace(/\/$/, "")
        if (text.indexOf(server + "/") !== 0) return ""
        var match = text.match(/[#&]jwt=([^&]+)/)
        if (!match) return ""
        // The sign-in page writes jwt=JSON.stringify(token), i.e. in quotes;
        // jitsi-meet reads URL parameters with JSON.parse (parseURLParams).
        var value = decodeURIComponent(match[1])
        try { value = JSON.parse(value) } catch (error) {}
        return typeof value === "string" ? value : ""
    }

    function check(url) {
        if (done) return
        var jwt = tokenFrom(url)
        if (!jwt) return
        done = true
        if (roomPage) roomPage.setToken(jwt)
        pageStack.pop(roomPage)
    }

    Rectangle { anchors.fill: parent; color: AppStyle.background }

    PageHeader {
        id: header
        title: appState.t("dialog.IamHost")
        subtitle: String(web.url).split("/").slice(0, 3).join("/")
    }

    WebView {
        id: web
        anchors { top: header.bottom; bottom: parent.bottom; left: parent.left; right: parent.right }
        url: page.address
        onUrlChanged: page.check(url)
    }
}
