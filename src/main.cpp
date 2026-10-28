#include <QtQuick>
#include <auroraapp.h>
#include <webenginecontext.h>
#include "appstate.h"
#include "clienttranslator.h"

int main(int argc, char *argv[])
{
    QCoreApplication::setAttribute(Qt::AA_ShareOpenGLContexts);

    // Private SDK adapter; a physical device keeps its normal camera backend.
    const QByteArray privateLibs("/usr/share/ru.vkr.JitsiAuroraPrototype/lib");
    if (QFile::exists("/usr/lib64/gstreamer-1.0/libgstemulatorcamsrc.so")
            && QFile::exists(QString::fromLatin1(privateLibs) + "/gstreamer-1.0/libgstemulatorprovider.so")) {
        QByteArray pluginPaths = privateLibs + "/gstreamer-1.0";
        const QByteArray existingPaths = qgetenv("GST_PLUGIN_PATH");
        if (!existingPaths.isEmpty()) pluginPaths += ':' + existingPaths;
        qputenv("GST_PLUGIN_PATH", pluginPaths);
        // GStreamer relocates its default plugin directory beside its private
        // library. The emulator's actual capture/decoder plugins stay in /usr.
        if (qgetenv("GST_PLUGIN_SYSTEM_PATH_1_0").isEmpty())
            qputenv("GST_PLUGIN_SYSTEM_PATH_1_0", "/usr/lib64/gstreamer-1.0");
        qputenv("STREAMCAMERA_PLUGIN_DIR", privateLibs + "/streamcamera");
        qputenv("GSTREAMER_CAMERA_DEVICE_PROVIDER", "aurorajitsiemulatorprovider");
    }
    Aurora::WebView::WebEngineContext::InitBrowser(argc, argv);

    QScopedPointer<QGuiApplication> application(Aurora::Application::application(argc, argv));
    application->setOrganizationName(QStringLiteral("ru.vkr"));
    application->setApplicationName(QStringLiteral("JitsiAuroraPrototype"));

    AppState appState;
    ClientTranslator english(Aurora::Application::pathTo("qml/languages/en.json").toLocalFile());
    auto applyLanguage = [&]() {
        application->removeTranslator(&english);
        if (appState.preferences().value("language").toString() == "en") application->installTranslator(&english);
    };
    applyLanguage();
    QObject::connect(&appState, &AppState::interfaceLanguageChanged, application.data(), applyLanguage);
    QScopedPointer<QQuickView> view(Aurora::Application::createView());
    view->rootContext()->setContextProperty(QStringLiteral("appState"), &appState);
    view->setSource(Aurora::Application::pathTo(QStringLiteral("qml/JitsiAuroraPrototype.qml")));
    view->show();

    return application->exec();
}
