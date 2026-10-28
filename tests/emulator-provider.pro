TEMPLATE = lib
TARGET = gstemulatorprovider
QT -= gui
CONFIG += plugin c++11 link_pkgconfig
PKGCONFIG += gstreamer-1.0
SOURCES += ../emulator/emulator-provider.cpp
