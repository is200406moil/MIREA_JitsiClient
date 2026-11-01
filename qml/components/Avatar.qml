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
    color: avatar.name.trim() ? AppStyle.avatarColor(avatar.name) : "#494949"
    clip: true
    Label {
        anchors.centerIn: parent
        text: appState.initials(avatar.name)
        color: AppStyle.text
        font.pixelSize: avatar.width * 0.45
        font.weight: Font.Light
        visible: avatar.name.trim().length > 0 && photo.status !== Image.Ready
    }
    Image { anchors.centerIn: parent; width: parent.width * 0.8; height: width; source: "../icons/person.svg"; visible: !avatar.name.trim() && photo.status !== Image.Ready }
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
