import QtQuick 2.6
import Sailfish.Silica 1.0
import QtGraphicalEffects 1.0
import "."

Rectangle {
    id: avatar
    property string name
    property string imageUrl
    readonly property int imageStatus: photo.status
    width: Theme.itemSizeLarge
    height: width
    radius: width / 2
    color: AppStyle.raised
    clip: true
    Label {
        anchors.centerIn: parent
        text: appState.initials(avatar.name)
        color: AppStyle.accentLight
        font.pixelSize: avatar.width * 0.32
        visible: photo.status !== Image.Ready
    }
    Image {
        id: photo
        anchors.fill: parent
        source: avatar.imageUrl
        fillMode: Image.PreserveAspectCrop
        asynchronous: true
        visible: status === Image.Ready
        layer.enabled: true
        layer.effect: OpacityMask {
            maskSource: Rectangle { width: avatar.width; height: avatar.height; radius: width / 2 }
        }
    }
}
