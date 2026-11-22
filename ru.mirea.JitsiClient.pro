TARGET = ru.mirea.JitsiClient

QT += network dbus sql

# The version shown in the settings comes from the package (rpm/*.spec).
isEmpty(VERSION): VERSION = 0.1
isEmpty(RELEASE): RELEASE = 0
DEFINES += APP_VERSION=\\\"$$VERSION\\\" APP_RELEASE=\\\"$$RELEASE\\\"
# The Aurora OS version of the build target (shown in the settings as the
# SDK version): VERSION_ID of the target's os-release.
# Read by qmake itself: the IDE also parses the project on the Windows host.
isEmpty(SDK_VERSION):exists(/etc/os-release) {
    for(line, $$list($$cat(/etc/os-release, lines))) {
        contains(line, ^VERSION_ID=.*): SDK_VERSION = $$replace(line, ^VERSION_ID=\"?([^\"]*)\"?$, \\1)
    }
}
isEmpty(SDK_VERSION): SDK_VERSION = unknown
DEFINES += APP_SDK_VERSION=\\\"$$SDK_VERSION\\\"

CONFIG += \
    auroraapp

# The libraries of the build target (BuildRequires of the spec file). The
# IDE also parses the project on the Windows host, where pkg-config does not
# see the target; only the build engine (with /etc/os-release) reports a
# missing one.
for(package, $$list(qca2-qt5 streamcamera)) {
    packagesExist($$package): PKGCONFIG += $$package
    else:exists(/etc/os-release): error("$$package development package not found")
}
# On the Windows host the IDE's code model takes the headers of these
# libraries from the target copy next to the Qt headers of the kit.
!exists(/etc/os-release) {
    QT_INSTALL_HEADERS_PATH = $$[QT_INSTALL_HEADERS]
    TARGET_HEADERS = $$dirname(QT_INSTALL_HEADERS_PATH)
    INCLUDEPATH += \
        $$QT_INSTALL_HEADERS_PATH/QtCrypto \
        $$TARGET_HEADERS/streamcamera \
        $$TARGET_HEADERS/aurorawebview \
        $$TARGET_HEADERS/gstreamer-1.0 \
        $$TARGET_HEADERS/glib-2.0 \
        $$dirname(TARGET_HEADERS)/lib64/glib-2.0/include \
        $$dirname(TARGET_HEADERS)/lib/glib-2.0/include
}

# Aurora OS 5.2 and later have the Chromium based Aurora WebView; Aurora OS
# 5.1 has only the Gecko based Sailfish WebView (CONFIG+=gecko, set by the
# spec file). Each package gets only its own variant of qml/webview.
gecko {
    DEFINES += APP_GECKO_WEBVIEW
    SOURCES += src/nativecamera.cpp
    HEADERS += src/nativecamera.h
    webview.files = $$files($$PWD/webview/gecko/*.qml)
} else {
    packagesExist(aurorawebview): PKGCONFIG += aurorawebview
    webview.files = $$files($$PWD/webview/cef/*.qml)
}
webview.path = /usr/share/$$TARGET/qml/webview
INSTALLS += webview

contains(QT_ARCH, x86_64) {
    packagesExist(gstreamer-1.0): PKGCONFIG += gstreamer-1.0
    EMULATOR_PROVIDER_SOURCE = $$PWD/emulator/emulator-provider.cpp
    emulator_provider.input = EMULATOR_PROVIDER_SOURCE
    emulator_provider.output = libgstemulatorprovider.so
    emulator_provider.commands = $(CXX) $(CXXFLAGS) $(INCPATH) -shared -Wl,-z,relro,-z,now -o ${QMAKE_FILE_OUT} ${QMAKE_FILE_IN} -lgstreamer-1.0 -lgobject-2.0 -lglib-2.0
    emulator_provider.CONFIG += no_link target_predeps
    QMAKE_EXTRA_COMPILERS += emulator_provider
    emulator_plugins.files = $$OUT_PWD/libgstemulatorprovider.so
    emulator_plugins.path = /usr/share/$$TARGET/lib/gstreamer-1.0
    emulator_plugins.CONFIG += no_check_exist
    INSTALLS += emulator_plugins
}

SOURCES += \
    src/main.cpp \
    src/appstate.cpp \
    src/callcontrol.cpp \
    src/fileopener.cpp \
    src/keystoreloginstore.cpp \
    src/keystorekey.cpp \
    src/screencapture.cpp \
    src/storage.cpp

HEADERS += \
    src/appstate.h \
    src/callcontrol.h \
    src/fileopener.h \
    src/clienttranslator.h \
    src/keystoreloginstore.h \
    src/keystorekey.h \
    src/screencapture.h \
    src/storage.h

# The files shown in the project tree of the IDE; qml/ is installed as a
# whole by auroraapp, the web views by INSTALLS above.
DISTFILES += \
    rpm/ru.mirea.JitsiClient.spec \
    ru.mirea.JitsiClient.desktop \
    $$files($$PWD/qml/*.qml, true) \
    $$files($$PWD/qml/*.js, true) \
    $$files($$PWD/qml/*.html, true) \
    $$files($$PWD/qml/*.css, true) \
    $$files($$PWD/qml/*.json, true) \
    $$files($$PWD/qml/*.svg, true) \
    $$files($$PWD/qml/*.png, true) \
    $$files($$PWD/qml/*.ttf, true) \
    $$files($$PWD/qml/qmldir, true) \
    $$files($$PWD/qml/LICENSE, true) \
    $$files($$PWD/qml/*.txt, true) \
    $$files($$PWD/icons/*.png, true) \
    $$files($$PWD/icons/*.svg, true) \
    $$files($$PWD/webview/*.qml, true)

AURORAAPP_ICONS = 86x86 108x108 128x128 172x172

