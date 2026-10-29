import QtQuick 2.6
import Sailfish.Silica 1.0
import "../components"

Page {
    id: page
    allowedOrientations: Orientation.All
    property var room
    property var info: appState.dialInInfo

    function flagCode(country) {
        var flags = {"US": "us", "UK": "gb", "France": "fr", "Netherlands": "nl",
                     "Spain": "es", "Canada": "ca", "Australia": "au", "Brazil": "br",
                     "Japan": "jp", "Switzerland": "ch"}
        return flags[country] || ""
    }
    function formattedPin(pin) {
        var length = Math.ceil(pin.length / 3)
        return pin.substring(0, length) + " " + pin.substring(length, 2 * length) + " " + pin.substring(2 * length)
    }
    Component.onCompleted: appState.fetchDialInInfo(room)
    Rectangle { anchors.fill: parent; color: AppStyle.surface }
    Item {
        id: viewport
        width: page.width / 2
        height: page.height / 2
        scale: 2
        transformOrigin: Item.TopLeft
        SilicaFlickable {
            anchors.fill: parent
            contentHeight: content.height + 16
            Column {
                id: content
                width: parent.width
                Item {
                    width: parent.width; height: 64
                    Rectangle { anchors.fill: parent; color: AppStyle.surface }
                    BackgroundItem {
                        width: 72; height: parent.height
                        Label { anchors.centerIn: parent; text: qsTr("Закрыть"); color: AppStyle.accent; font.pixelSize: 16 }
                        onClicked: pageStack.pop()
                    }
                    Label {
                        x: 78; width: parent.width - 86
                        anchors.verticalCenter: parent.verticalCenter
                        text: qsTr("Сводка о входящем вызове")
                        horizontalAlignment: Text.AlignHCenter
                        color: AppStyle.text; font.pixelSize: 17; font.bold: true
                        elide: Text.ElideRight
                    }
                }
                Item { width: 1; height: 36 }
                Label {
                    width: parent.width
                    text: page.room.name
                    color: AppStyle.text; font.pixelSize: 20; font.bold: true
                    horizontalAlignment: Text.AlignHCenter
                }
                Item { width: 1; height: 48 }
                Rectangle {
                    x: 24; width: parent.width - 48; height: 158
                    visible: !!page.info.pin
                    color: "#666666"; radius: 6
                    Label {
                        x: 12; y: 16; width: parent.width - 24; height: 80
                        text: qsTr("Чтобы присоединиться к конференции, наберите один из этих номеров и введите пин-код")
                        color: AppStyle.text; font.pixelSize: 16; wrapMode: Text.Wrap
                        horizontalAlignment: Text.AlignHCenter; verticalAlignment: Text.AlignVCenter
                    }
                    Rectangle { x: 12; y: 100; width: parent.width - 24; height: 1; color: AppStyle.text }
                    Label {
                        anchors.horizontalCenter: parent.horizontalCenter
                        y: 116
                        text: qsTr("ПИН:") + " " + page.formattedPin(page.info.pin || "")
                        color: AppStyle.text; font.pixelSize: 18; font.bold: true
                    }
                }
                Item { width: 1; height: page.info.pin ? 16 : 0 }
                Repeater {
                    model: page.info.numbers || []
                    delegate: Item {
                        property string countryFlag: page.flagCode(modelData.country)
                        width: content.width; height: 56
                        Image { x: 32; y: 5; width: 20; height: 15; visible: countryFlag.length > 0; source: countryFlag ? Qt.resolvedUrl("../flags/" + countryFlag + ".svg") : ""; fillMode: Image.PreserveAspectFit }
                        Label { x: countryFlag ? 59 : 32; y: 4; text: modelData.country; font.pixelSize: 15; font.bold: true; color: AppStyle.text }
                        BackgroundItem {
                            x: 56; y: 24; width: parent.width - x - 24; height: 32
                            Label { anchors.verticalCenter: parent.verticalCenter; text: modelData.number; color: AppStyle.accent; font.pixelSize: 16; font.bold: true }
                            onClicked: Qt.openUrlExternally("tel:" + modelData.number.replace(/[^+0-9]/g, ""))
                        }
                    }
                }
                Label {
                    x: 24; width: parent.width - 48
                    visible: !page.info.loading && !page.info.pin && (!page.info.numbers || page.info.numbers.length === 0)
                    text: qsTr("Нет номеров для набора.")
                    color: AppStyle.muted; font.pixelSize: 16; wrapMode: Text.Wrap
                    horizontalAlignment: Text.AlignHCenter
                }
            }
            VerticalScrollDecorator {}
        }
        BusyIndicator {
            anchors.centerIn: parent
            size: BusyIndicatorSize.Large
            running: page.info.loading || false
            visible: running
        }
    }
}
