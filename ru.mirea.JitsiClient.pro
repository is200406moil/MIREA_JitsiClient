TARGET = ru.mirea.JitsiClient

QT += network dbus sql

# The version shown in the settings comes from the package (rpm/*.spec).
isEmpty(VERSION): VERSION = 0.1
isEmpty(RELEASE): RELEASE = 0
DEFINES += APP_VERSION=\\\"$$VERSION\\\" APP_RELEASE=\\\"$$RELEASE\\\"
# The Aurora OS version of the build target (shown in the settings as the
# SDK version): VERSION_ID of the target's os-release.
isEmpty(SDK_VERSION): SDK_VERSION = $$system(sed -n 's/^VERSION_ID=//p' /etc/os-release)
isEmpty(SDK_VERSION): SDK_VERSION = unknown
DEFINES += APP_SDK_VERSION=\\\"$$SDK_VERSION\\\"

CONFIG += \
    auroraapp

PKGCONFIG += \
    qca2-qt5 \
    streamcamera

# Aurora OS 5.2 and later have the Chromium based Aurora WebView; Aurora OS
# 5.1 has only the Gecko based Sailfish WebView (CONFIG+=gecko, set by the
# spec file). Each package gets only its own variant of qml/webview.
gecko {
    DEFINES += APP_GECKO_WEBVIEW
    SOURCES += src/nativecamera.cpp
    HEADERS += src/nativecamera.h
    webview.files = $$files($$PWD/webview/gecko/*.qml)
} else {
    PKGCONFIG += aurorawebview
    webview.files = $$files($$PWD/webview/cef/*.qml)
}
webview.path = /usr/share/$$TARGET/qml/webview
INSTALLS += webview

contains(QT_ARCH, x86_64) {
    PKGCONFIG += gstreamer-1.0
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

DISTFILES += \
    rpm/ru.mirea.JitsiClient.spec \

AURORAAPP_ICONS = 86x86 108x108 128x128 172x172

