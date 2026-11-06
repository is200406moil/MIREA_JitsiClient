TEMPLATE = app
TARGET = keystore-probe
QT = core
CONFIG += console c++11 link_pkgconfig
CONFIG -= app_bundle
PKGCONFIG += qca2-qt5
SOURCES += keystore-probe.cpp ../src/keystorekey.cpp
HEADERS += ../src/keystorekey.h
