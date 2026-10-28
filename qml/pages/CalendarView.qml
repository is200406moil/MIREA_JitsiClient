import QtQuick 2.6
import Sailfish.Silica 1.0
import "../components"

SilicaFlickable {
    id: view
    signal openRoom(string input)
    property string formError
    contentHeight: body.height + Theme.paddingLarge
    Column {
        id: body
        width: parent.width
        JoinRoomForm { error: view.formError; onSubmitted: view.openRoom(input) }
    }
    VerticalScrollDecorator {}
}
