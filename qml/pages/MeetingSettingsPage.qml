import QtQuick 2.6
import Sailfish.Silica 1.0
import "../components"

// "Settings" from the call's overflow menu: the application settings in
// their in-meeting form (SettingsView hides what applies only to new calls).
// Laid out in dp like MainPage, where SettingsView normally lives.
Page {
    id: page
    allowedOrientations: Orientation.All
    property string title

    Item {
        width: page.width / AppStyle.dp
        height: page.height / AppStyle.dp
        scale: AppStyle.dp
        transformOrigin: Item.TopLeft
        Rectangle { anchors.fill: parent; color: AppStyle.surface }
        ScreenHeader {
            id: header
            title: page.title
            showBack: true
            closeIcon: true
            onBackClicked: pageStack.pop()
        }
        SettingsView {
            inMeeting: true
            anchors { top: header.bottom; bottom: parent.bottom; left: parent.left; right: parent.right }
            clip: true
        }
    }
}
