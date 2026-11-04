#include "callcontrol.h"

#include <QDBusConnection>
#include <QDBusArgument>
#include <QDBusMessage>
#include <QDir>
#include <QFile>
#include <QFileInfo>
#include <QStandardPaths>
#include <QTimer>
#include <QVariantMap>

namespace {

const QString Service = QStringLiteral("ru.vkr.JitsiAuroraPrototype");
const QString Path = QStringLiteral("/call");
const QString Interface = QStringLiteral("ru.vkr.JitsiAuroraPrototype.Call");
const QString NotificationsService = QStringLiteral("org.freedesktop.Notifications");
const QString NotificationsPath = QStringLiteral("/org/freedesktop/Notifications");
// The notification lives this long unless renewed while the meeting is on.
const int ExpireMs = 60000;
const int RenewMs = 20000;

QString idFile()
{
    return QStandardPaths::writableLocation(QStandardPaths::AppDataLocation) + QStringLiteral("/notification.id");
}

// The Nemo remote action hint: "service path interface method".
QString remoteAction(const QString &method)
{
    return Service + QLatin1Char(' ') + Path + QLatin1Char(' ') + Interface + QLatin1Char(' ') + method;
}

} // namespace

CallControl::CallControl(QObject *parent)
    : QObject(parent)
{
    m_renew.setInterval(RenewMs);
    connect(&m_renew, &QTimer::timeout, this, &CallControl::publish);
}

bool CallControl::registerOnBus()
{
    QDBusConnection bus = QDBusConnection::sessionBus();
    QFile previous(idFile());
    if (previous.open(QIODevice::ReadOnly)) {
        const uint stale = previous.readAll().trimmed().toUInt();
        previous.close();
        if (stale) closeNotification(stale);
        previous.remove();
    }
    closeLeftovers();
    bus.connect(NotificationsService, NotificationsPath, NotificationsService, QStringLiteral("NotificationClosed"),
                this, SLOT(onNotificationClosed(uint,uint)));
    // Notification actions may call only the application's own name, which
    // the system checks against the application id.
    return bus.registerObject(Path, this, QDBusConnection::ExportScriptableSlots)
        && bus.registerService(Service);
}

void CallControl::showNotification(const QString &summary, const QString &body,
                                   const QString &muteLabel, const QString &hangupLabel)
{
    m_summary = summary;
    m_body = body;
    m_muteLabel = muteLabel;
    m_hangupLabel = hangupLabel;
    m_shown = true;
    m_since = QDateTime::currentDateTime();
    publish();
    m_renew.start();
}

void CallControl::updateNotification(const QString &body, const QString &muteLabel)
{
    if (body == m_body && muteLabel == m_muteLabel) return;
    m_body = body;
    m_muteLabel = muteLabel;
    publish();
}

void CallControl::hideNotification()
{
    m_shown = false;
    m_renew.stop();
    if (!m_id) return;
    closeNotification(m_id);
    m_id = 0;
    rememberId(0);
}

void CallControl::closeNotification(uint id)
{
    QDBusMessage message = QDBusMessage::createMethodCall(NotificationsService, NotificationsPath,
                                                          NotificationsService, QStringLiteral("CloseNotification"));
    message << id;
    QDBusConnection::sessionBus().call(message, QDBus::NoBlock);
}

void CallControl::closeLeftovers()
{
    QDBusMessage message = QDBusMessage::createMethodCall(NotificationsService, NotificationsPath,
                                                          NotificationsService, QStringLiteral("GetNotifications"));
    message << QString();
    const QDBusMessage reply = QDBusConnection::sessionBus().call(message);
    if (reply.type() != QDBusMessage::ReplyMessage || reply.arguments().isEmpty()) return;
    // a(susssasa{sv}i): app name, id, icon, summary, body, actions, hints, timeout
    const QDBusArgument list = reply.arguments().first().value<QDBusArgument>();
    list.beginArray();
    while (!list.atEnd()) {
        QString appName, icon, summary, body;
        uint id = 0;
        QStringList actions;
        QVariantMap hints;
        int timeout = 0;
        list.beginStructure();
        list >> appName >> id >> icon >> summary >> body >> actions >> hints >> timeout;
        list.endStructure();
        if (icon == Service && actions.contains(QStringLiteral("hangup"))) closeNotification(id);
    }
    list.endArray();
}

void CallControl::rememberId(uint id)
{
    QFile file(idFile());
    if (!id) {
        file.remove();
        return;
    }
    QDir().mkpath(QFileInfo(file).absolutePath());
    if (file.open(QIODevice::WriteOnly | QIODevice::Truncate)) file.write(QByteArray::number(id));
}

void CallControl::publish()
{
    if (!m_shown) return;
    QVariantMap hints;
    // No "urgency" hint: the shell rejects the byte the specification
    // defines as an ill-formed field; normal urgency is the default.
    // Kept in the notification area only, without a popup banner.
    hints.insert(QStringLiteral("x-nemo-preview-summary"), QString());
    hints.insert(QStringLiteral("x-nemo-preview-body"), QString());
    // Not removed by "Clear all", kept after its buttons are used, and silent
    // when it is published or updated.
    hints.insert(QStringLiteral("x-nemo-user-removable"), false);
    hints.insert(QStringLiteral("resident"), true);
    hints.insert(QStringLiteral("suppress-sound"), true);
    // The time shown is the start of the meeting, not of the last renewal.
    hints.insert(QStringLiteral("x-nemo-timestamp"), m_since.toString(Qt::ISODate));
    hints.insert(QStringLiteral("x-nemo-remote-action-default"), remoteAction(QStringLiteral("activate")));
    hints.insert(QStringLiteral("x-nemo-remote-action-mute"), remoteAction(QStringLiteral("toggleAudio")));
    hints.insert(QStringLiteral("x-nemo-remote-action-hangup"), remoteAction(QStringLiteral("hangup")));
    const QStringList actions = { QStringLiteral("default"), QString(),
                                  QStringLiteral("mute"), m_muteLabel,
                                  QStringLiteral("hangup"), m_hangupLabel };

    QDBusMessage message = QDBusMessage::createMethodCall(NotificationsService, NotificationsPath,
                                                          NotificationsService, QStringLiteral("Notify"));
    // An existing notification is updated in place; a removed one is replaced
    // by a new one.
    message << QStringLiteral("Jitsi Meet") << m_id << QStringLiteral("ru.vkr.JitsiAuroraPrototype")
            << m_summary << m_body << actions << hints << ExpireMs;
    const QDBusMessage reply = QDBusConnection::sessionBus().call(message);
    const uint id = reply.type() == QDBusMessage::ReplyMessage && !reply.arguments().isEmpty()
        ? reply.arguments().first().toUInt() : 0;
    if (id) {
        if (id != m_id) rememberId(id);
        m_id = id;
    } else if (m_id) {
        // The old id is no longer known to the shell.
        m_id = 0;
        publish();
    }
}

void CallControl::onNotificationClosed(uint id, uint reason)
{
    Q_UNUSED(reason)
    if (id != m_id) return;
    m_id = 0;
    // The meeting is still on: tapped or cleared, it comes back.
    if (m_shown) QTimer::singleShot(500, this, &CallControl::publish);
}

void CallControl::activate()
{
    emit activateRequested();
}

void CallControl::toggleAudio()
{
    emit toggleAudioRequested();
}

void CallControl::hangup()
{
    emit hangupRequested();
}
