import QtQuick 2.6
import "."

// ScreenHeader for pages whose content is not scaled (web views): the header
// is laid out in dp and scaled, the page keeps its native size.
Item {
    id: holder
    property alias title: header.title
    property alias subtitle: header.subtitle
    property alias showBack: header.showBack
    property alias closeIcon: header.closeIcon
    signal backClicked()
    width: parent.width
    height: header.height * AppStyle.dp
    ScreenHeader {
        id: header
        width: holder.width / AppStyle.dp
        scale: AppStyle.dp
        transformOrigin: Item.TopLeft
        showBack: true
        onBackClicked: holder.backClicked()
    }
}
