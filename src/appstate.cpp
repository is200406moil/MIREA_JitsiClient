#include "appstate.h"

#include <QCryptographicHash>
#include <QClipboard>
#include <QDateTime>
#include <QDir>
#include <QFile>
#include <QGuiApplication>
#include <QJsonArray>
#include <QJsonDocument>
#include <QJsonObject>
#include <QLocale>
#include <QRegularExpression>
#include <QSettings>
#include <QStandardPaths>
#include <QTcpSocket>
#include <QTimer>
#include <QUrl>
#include <QUuid>
#include <auroraapp.h>
#include <algorithm>

AppState::AppState(QObject *parent, const QString &settingsFile) : QObject(parent)
{
    // settingsFile is the old QSettings data of the unit tests; the database lies beside it.
    QSettings legacy;
    QSettings testLegacy(settingsFile, QSettings::IniFormat);
    const QString database = settingsFile.isEmpty()
        ? QStandardPaths::writableLocation(QStandardPaths::AppDataLocation) + "/jitsi.db"
        : settingsFile + ".db";
    if (!m_store.open(database, settingsFile.isEmpty() ? &legacy : &testLegacy))
        appendCallLog("database is not available: " + m_store.error());
    m_rooms = m_store.rooms();
    connect(&m_http, &QTcpServer::newConnection, this, &AppState::acceptConnection);
    loadStrings();
}

QString AppState::displayName() const { return m_store.value("name").toString(); }
QString AppState::email() const { return m_store.value("email").toString(); }
QString AppState::server() const
{
    const QString saved = m_store.value("server").toString();
    return saved == "https://meet.jit.si" ? QString() : saved;
}
bool AppState::audioMuted() const { return m_store.value("audioMuted", false).toBool(); }
bool AppState::videoMuted() const { return m_store.value("videoMuted", false).toBool(); }

QVariantMap AppState::preferences() const
{
    QVariantMap values;
    const QStringList falseDefaults = { "hideSelfView", "lowBandwidth", "audioMuted", "videoMuted", "disableP2p",
                                        "disableCrashReporting" };
    const QStringList trueDefaults = { "soundReactions", "soundMessage", "soundJoined", "soundLeft",
                                      "soundTalkMuted", "soundLobby", "chatNotifications" };
    for (const QString &key : falseDefaults) values[key] = m_store.value(key, false).toBool();
    for (const QString &key : trueDefaults) values[key] = m_store.value(key, true).toBool();
    values["language"] = m_store.value("language", "ru").toString();
    // The YouTube or RTMP stream key, kept like jitsi-meet's setLiveStreamKey.
    values["liveStreamKey"] = m_store.value("liveStreamKey").toString();
    return values;
}

bool AppState::setPreference(const QString &key, const QVariant &value)
{
    const QVariantMap current = preferences();
    if (!current.contains(key)) return false;
    if (key == "language") {
        if (value.toString() != "ru" && value.toString() != "en") return false;
        m_store.setValue(key, value.toString());
    } else if (key == "liveStreamKey") {
        const QString text = value.toString().trimmed();
        if (text.size() > 1024) return false;
        m_store.setValue(key, text);
    } else {
        if (value.type() != QVariant::Bool) return false;
        m_store.setValue(key, value.toBool());
    }
    emit settingsChanged();
    if (key == "language" && current.value(key) != value) {
        loadStrings();
        emit interfaceLanguageChanged();
    }
    return true;
}

QString AppState::roomSection(qint64 timestamp) const
{
    if (!timestamp) return t("dateUtils.earlier");
    const QDate date = QDateTime::fromMSecsSinceEpoch(timestamp).date();
    if (date == QDate::currentDate()) return t("dateUtils.today");
    if (date == QDate::currentDate().addDays(-1)) return t("dateUtils.yesterday");
    return t("dateUtils.earlier");
}

QString AppState::avatarUrl() const
{
    if (email().isEmpty()) return QString();
    const QByteArray hash = QCryptographicHash::hash(email().trimmed().toLower().toUtf8(), QCryptographicHash::Sha256).toHex();
    return "https://www.gravatar.com/avatar/" + QString::fromLatin1(hash) + "?s=256&d=404&r=g";
}

void AppState::copyText(const QString &text)
{
    QGuiApplication::clipboard()->setText(text);
}

QVariantList AppState::rooms() const
{
    QVariantList sorted = m_rooms;
    std::stable_sort(sorted.begin(), sorted.end(), [](const QVariant &a, const QVariant &b) {
        return a.toMap().value("lastUsed").toLongLong() > b.toMap().value("lastUsed").toLongLong();
    });
    return sorted;
}

void AppState::setError(const QString &message)
{
    m_error = message;
    emit errorChanged();
}

QString AppState::normalizedServer(const QString &input) const
{
    QString text = input.trimmed();
    if (!text.contains("://")) text.prepend("https://");
    const QUrl url(text, QUrl::StrictMode);
    if (!url.isValid() || url.scheme() != "https" || url.host().isEmpty()
        || !url.userInfo().isEmpty() || url.hasQuery() || url.hasFragment()) return QString();
    QString result = url.toString(QUrl::RemoveFragment | QUrl::RemoveQuery | QUrl::StripTrailingSlash);
    while (result.endsWith('/')) result.chop(1);
    return result;
}

bool AppState::saveProfile(const QString &name, const QString &mail)
{
    const QString cleanedMail = mail.trimmed().toLower();
    if (!cleanedMail.isEmpty() && !QRegularExpression("^[^\\s@]+@[^\\s@]+\\.[^\\s@]+$").match(cleanedMail).hasMatch()) {
        setError(tr("Проверьте адрес электронной почты."));
        return false;
    }
    m_store.setValue("name", name.trimmed().left(100));
    m_store.setValue("email", cleanedMail);
    setError(QString());
    emit profileChanged();
    return true;
}

bool AppState::saveSettings(const QString &address, bool muteAudio, bool muteVideo)
{
    const QString normalized = address.trimmed().isEmpty() ? QString() : normalizedServer(address);
    if (!address.trimmed().isEmpty() && normalized.isEmpty()) {
        setError(tr("Проверьте адрес сервера."));
        return false;
    }
    if (normalized.isEmpty() || normalized == "https://meet.jit.si") m_store.remove("server");
    else m_store.setValue("server", normalized);
    m_store.setValue("audioMuted", muteAudio);
    m_store.setValue("videoMuted", muteVideo);
    setError(QString());
    emit settingsChanged();
    return true;
}

QVariantMap AppState::saveRoom(const QString &input, bool remember)
{
    QString name = input.trimmed();
    QString address = server().isEmpty() ? QStringLiteral("https://meet.jit.si") : server();
    // "meet.example.org/room" is a meeting link without the scheme.
    static const QRegularExpression bareLink("^[A-Za-z0-9-]+(\\.[A-Za-z0-9-]+)+(:\\d+)?/\\S+$");
    if (!name.contains("://") && bareLink.match(name).hasMatch()) name.prepend("https://");
    if (name.startsWith("https://", Qt::CaseInsensitive)) {
        const QUrl link(name, QUrl::TolerantMode);
        if (!link.isValid() || link.host().isEmpty() || !link.userInfo().isEmpty()) {
            setError(tr("Проверьте ссылку на встречу."));
            return QVariantMap();
        }
        address = normalizedServer(link.adjusted(QUrl::RemovePath | QUrl::RemoveQuery | QUrl::RemoveFragment).toString());
        name = link.path(QUrl::FullyDecoded);
        while (name.startsWith('/')) name.remove(0, 1);
        while (name.endsWith('/')) name.chop(1);
    } else if (name.contains("://")) {
        setError(tr("Используйте ссылку, начинающуюся с https://."));
        return QVariantMap();
    }
    if (name.isEmpty() || name.size() > 256 || name.contains(QRegularExpression("[\\x00-\\x1f]"))) {
        setError(tr("Введите название комнаты или полную ссылку на встречу."));
        return QVariantMap();
    }
    const QString id = QString::fromLatin1(QCryptographicHash::hash((address + "/" + name).toUtf8(), QCryptographicHash::Sha256).toHex());
    for (const QVariant &entry : m_rooms) {
        if (entry.toMap().value("id").toString() == id) { setError(QString()); return entry.toMap(); }
    }
    QVariantMap room;
    room["id"] = id;
    room["name"] = name;
    room["server"] = address;
    room["lastUsed"] = qint64(0);
    if (remember) {
        m_rooms.prepend(room);
        storeRoom(room);
    }
    setError(QString());
    return room;
}

void AppState::storeRoom(const QVariantMap &room)
{
    m_store.saveRoom(room);
    emit roomsChanged();
}

void AppState::removeRoom(const QString &id)
{
    for (int i = 0; i < m_rooms.size(); ++i) {
        if (m_rooms.at(i).toMap().value("id").toString() == id) {
            m_rooms.removeAt(i);
            m_store.removeRoom(id);
            emit roomsChanged();
            return;
        }
    }
}

void AppState::importLegacy(const QString &json, const QString &name)
{
    if (m_store.value("migrated", false).toBool()) return;
    if (displayName().isEmpty() && !name.trimmed().isEmpty()) m_store.setValue("name", name.trimmed());
    for (const QJsonValue &entry : QJsonDocument::fromJson(json.toUtf8()).array()) {
        if (entry.isString()) saveRoom(entry.toString());
    }
    m_store.setValue("migrated", true);
    emit profileChanged();
}

void AppState::loadStrings()
{
    auto read = [](const QString &name) {
        QFile file(Aurora::Application::pathTo("qml/call/lang/" + name).toLocalFile());
        return file.open(QIODevice::ReadOnly) ? QJsonDocument::fromJson(file.readAll()).object() : QJsonObject();
    };
    m_fallbackStrings = read("main.json");
    m_languages = read("languages.json");
    m_strings = preferences().value("language").toString() == "en" ? m_fallbackStrings : read("main-ru.json");
}

// i18next lookup as in Jitsi: dotted keys, fallback to English, nested
// $t(key) references and {{name}} parameters.
QString AppState::t(const QString &key, const QVariantMap &params) const
{
    // i18next namespace "languages:" holds the language names.
    if (key.startsWith(QLatin1String("languages:"))) return m_languages.value(key.mid(10)).toString(key.mid(10));
    auto lookup = [&key](const QJsonObject &table) {
        QJsonValue node(table);
        for (const QString &part : key.split('.')) node = node.toObject().value(part);
        return node.isString() ? node.toString() : QString();
    };
    QString value = lookup(m_strings);
    if (value.isEmpty()) value = lookup(m_fallbackStrings);
    if (value.isEmpty()) return key;
    static const QRegularExpression nested("\\$t\\(([^)]+)\\)");
    QRegularExpressionMatch match;
    while ((match = nested.match(value)).hasMatch())
        value.replace(match.capturedStart(), match.capturedLength(), t(match.captured(1)));
    for (auto it = params.begin(); it != params.end(); ++it)
        value.replace(QRegularExpression("\\{\\{\\s*" + QRegularExpression::escape(it.key()) + "\\s*\\}\\}"), it.value().toString());
    return value;
}

QString AppState::initials(const QString &name) const
{
    const QStringList parts = name.simplified().split(' ', QString::SkipEmptyParts);
    if (parts.isEmpty()) return "J";
    QString result = parts.first().left(1);
    if (parts.size() > 1) result += parts.last().left(1);
    return result.toUpper();
}

QString AppState::formatDuration(double milliseconds) const
{
    const qint64 total = qMax<qint64>(0, qint64(milliseconds / 1000));
    const qint64 hours = total / 3600;
    const QString minutesSeconds = QStringLiteral("%1:%2")
        .arg((total / 60) % 60, 2, 10, QLatin1Char('0')).arg(total % 60, 2, 10, QLatin1Char('0'));
    return hours ? QString::number(hours) + QLatin1Char(':') + minutesSeconds : minutesSeconds;
}

QString AppState::roomDate(qint64 timestamp) const
{
    if (!timestamp) return QString();
    const QDateTime time = QDateTime::fromMSecsSinceEpoch(timestamp);
    if (time.date() == QDate::currentDate()) {
        const qint64 seconds = qMax<qint64>(0, time.secsTo(QDateTime::currentDateTime()));
        const bool english = preferences().value("language") == "en";
        if (seconds < 45) return english ? QStringLiteral("a few seconds ago") : QStringLiteral("несколько секунд назад");
        if (seconds < 90) return english ? QStringLiteral("a minute ago") : QStringLiteral("минуту назад");
        const int minutes = int(seconds / 60);
        if (minutes < 45) {
            if (english) return QStringLiteral("%1 minutes ago").arg(minutes);
            const int last = minutes % 10;
            const QString suffix = minutes % 100 >= 11 && minutes % 100 <= 14 ? QStringLiteral("минут")
                : last == 1 ? QStringLiteral("минуту") : last >= 2 && last <= 4 ? QStringLiteral("минуты") : QStringLiteral("минут");
            return QStringLiteral("%1 %2 назад").arg(minutes).arg(suffix);
        }
        if (seconds < 90 * 60) return english ? QStringLiteral("an hour ago") : QStringLiteral("час назад");
        const int hours = int(seconds / 3600);
        if (hours < 22) {
            if (english) return QStringLiteral("%1 hours ago").arg(hours);
            const int last = hours % 10;
            const QString suffix = hours % 100 >= 11 && hours % 100 <= 14 ? QStringLiteral("часов")
                : last == 1 ? QStringLiteral("час") : last >= 2 && last <= 4 ? QStringLiteral("часа") : QStringLiteral("часов");
            return QStringLiteral("%1 %2 назад").arg(hours).arg(suffix);
        }
    }
    if (time.date() == QDate::currentDate().addDays(-1)) return tr("Вчера, ") + time.toString("HH:mm");
    return QLocale(preferences().value("language") == "en" ? QLocale::English : QLocale::Russian).toString(time, "d MMMM, HH:mm");
}

bool AppState::startMeeting(const QVariantMap &room, bool muteAudio, bool muteVideo, bool audioOnly)
{
    const QString address = normalizedServer(room.value("server").toString());
    if (address.isEmpty() || room.value("name").toString().isEmpty()) {
        setError(tr("Не удалось определить адрес комнаты.")); return false;
    }
    if (!m_http.isListening() && !m_http.listen(QHostAddress::LocalHost, 0)) {
        setError(tr("Не удалось подготовить встречу. Перезапустите приложение.")); return false;
    }
    QFile file(Aurora::Application::pathTo("qml/call/index.html").toLocalFile());
    if (!file.open(QIODevice::ReadOnly)) { setError(tr("Не удалось загрузить экран встречи.")); return false; }
    m_activeRoom = room;
    bool remembered = false;
    for (const QVariant &entry : m_rooms) {
        if (entry.toMap().value("id") == room.value("id")) { remembered = true; break; }
    }
    if (!remembered) { m_rooms.prepend(room); storeRoom(room); }
    m_meetingStarted = QDateTime::currentMSecsSinceEpoch();
    // The call page runs on the loopback server; camera and microphone
    // requests are accepted only from this origin.
    m_meetingOrigin = QString("http://127.0.0.1:%1").arg(m_http.serverPort());
    m_route = "/meeting/" + QUuid::createUuid().toString().remove('{').remove('}') + "/";
    m_meetingUrl = m_meetingOrigin + m_route;
    const QString roomName = room.value("name").toString();
    QJsonObject config;
    config["server"] = address;
    config["room"] = roomName;
    config["displayName"] = displayName();
    config["email"] = email();
    config["avatarURL"] = avatarUrl();
    config["audioMuted"] = muteAudio;
    config["videoMuted"] = muteVideo;
    config["audioOnly"] = audioOnly;
    config["language"] = preferences().value("language").toString();
    // The login and the organizer token saved for this server: the meeting
    // signs in with them instead of asking again.
    const QVariantMap saved = m_logins ? m_logins->load(QUrl(address).host()) : QVariantMap();
    config["jwt"] = saved.value("jwt").toString();
    if (!saved.value("username").toString().isEmpty()) {
        QJsonObject login;
        login["username"] = saved.value("username").toString();
        login["password"] = saved.value("password").toString();
        config["savedLogin"] = login;
    }
    config["insecureRoomName"] = roomName.trimmed().size() <= 8;
    config["inviteUrl"] = address + "/" + QString::fromLatin1(QUrl::toPercentEncoding(roomName));
    config["securityHelpUrl"] = QStringLiteral("https://jitsi.github.io/handbook/docs/faq/#how-can-i-protect-my-meetings-with-jitsi");
    config["preferences"] = QJsonObject::fromVariantMap(preferences());
    // The WebView cannot capture the screen; the app does it (ScreenCapture).
    config["nativeScreenShare"] = m_screen != nullptr;
    QByteArray json = QJsonDocument(config).toJson(QJsonDocument::Compact);
    json.replace("<", "\\u003c");
    json.replace(">", "\\u003e");
    json.replace("&", "\\u0026");
    m_meetingHtml = file.readAll().replace("__CALL_CONFIG__", json);
    setError(QString());
    emit meetingChanged();
    return true;
}

bool AppState::isTrustedOrigin(const QString &origin) const
{
    const QUrl candidate(origin);
    const QUrl expected(m_meetingOrigin);
    return !m_meetingOrigin.isEmpty() && candidate.isValid() && candidate.scheme() == expected.scheme()
        && candidate.host() == expected.host() && candidate.port(-1) == expected.port(-1)
        && candidate.userInfo().isEmpty();
}

void AppState::finishMeeting()
{
    if (m_screen) m_screen->stop();
    if (m_meetingStarted > 0) {
        for (int i = 0; i < m_rooms.size(); ++i) {
            QVariantMap room = m_rooms.at(i).toMap();
            if (room.value("id") == m_activeRoom.value("id")) {
                room["lastUsed"] = m_meetingStarted;
                room["duration"] = (QDateTime::currentMSecsSinceEpoch() - m_meetingStarted) / 1000;
                m_rooms[i] = room;
                storeRoom(room);
                break;
            }
        }
        m_meetingStarted = 0;
    }
    m_meetingHtml.clear();
    m_activeRoom.clear();
    m_meetingUrl.clear();
    m_meetingOrigin.clear();
    m_route.clear();
    emit meetingChanged();
}

void AppState::markJoined()
{
    for (int i = 0; i < m_rooms.size(); ++i) {
        QVariantMap room = m_rooms.at(i).toMap();
        if (room.value("id") == m_activeRoom.value("id")) {
            room["lastUsed"] = QDateTime::currentMSecsSinceEpoch();
            m_rooms[i] = room;
            storeRoom(room);
            break;
        }
    }
}

// Errors of the call page, kept in the cache directory so they can be read
// from a device (the WebView console is not available there).
void AppState::appendCallLog(const QString &message)
{
    const QString directory = QStandardPaths::writableLocation(QStandardPaths::CacheLocation);
    QDir().mkpath(directory);
    QFile file(directory + "/call.log");
    if (file.size() > 512 * 1024) file.remove();
    if (!file.open(QIODevice::Append | QIODevice::Text)) return;
    file.write(QDateTime::currentDateTime().toString(Qt::ISODate).toUtf8() + ' '
               + m_activeRoom.value("server").toString().toUtf8() + ' ' + message.left(2000).toUtf8() + '\n');
}

void AppState::acceptConnection()
{
    while (m_http.hasPendingConnections()) {
        QTcpSocket *socket = m_http.nextPendingConnection();
        socket->setProperty("buffer", QByteArray());
        connect(socket, &QTcpSocket::readyRead, this, [this, socket]() { handleRequest(socket); });
        connect(socket, &QTcpSocket::disconnected, socket, &QObject::deleteLater);
        QTimer::singleShot(10000, socket, [socket]() { socket->disconnectFromHost(); });
    }
}

void AppState::sendResponse(QTcpSocket *socket, int status, const QByteArray &type, const QByteArray &body)
{
    socket->write("HTTP/1.1 " + QByteArray::number(status) + (status == 200 ? " OK\r\n" : " Error\r\n")
                  + "Content-Type: " + type + "\r\nContent-Length: " + QByteArray::number(body.size())
                  + "\r\nCache-Control: no-store\r\nX-Content-Type-Options: nosniff\r\nConnection: close\r\n\r\n" + body);
    socket->disconnectFromHost();
}

void AppState::handleRequest(QTcpSocket *socket)
{
    if (socket->property("handled").toBool()) return;
    QByteArray buffer = socket->property("buffer").toByteArray() + socket->readAll();
    if (buffer.size() > 65536) { sendResponse(socket, 413, "text/plain", "Request too large"); return; }
    socket->setProperty("buffer", buffer);
    const int split = buffer.indexOf("\r\n\r\n");
    if (split < 0) return;
    const QList<QByteArray> lines = buffer.left(split).split('\n');
    const QList<QByteArray> request = lines.first().trimmed().split(' ');
    if (request.size() != 3) { sendResponse(socket, 400, "text/plain", "Bad request"); return; }
    int contentLength = 0;
    QByteArray origin;
    QByteArray host;
    for (const QByteArray &line : lines) {
        const int colon = line.indexOf(':');
        if (colon < 0) continue;
        const QByteArray key = line.left(colon).trimmed().toLower();
        const QByteArray value = line.mid(colon + 1).trimmed();
        if (key == "content-length") contentLength = value.toInt();
        if (key == "origin") origin = value;
        if (key == "host") host = value;
    }
    if (contentLength < 0 || contentLength > 32768) { sendResponse(socket, 413, "text/plain", "Request too large"); return; }
    if (buffer.size() < split + 4 + contentLength) return;
    socket->setProperty("handled", true);
    const QByteArray expectedHost = "127.0.0.1:" + QByteArray::number(m_http.serverPort());
    if (host != expectedHost || m_route.isEmpty()) {
        appendCallLog(QStringLiteral("local server refused: host %1, route %2").arg(QString::fromUtf8(host), m_route.isEmpty() ? "none" : "set"));
        sendResponse(socket, 404, "text/plain", "Not found");
        return;
    }
    const QByteArray route = m_route.toUtf8();
    if (request[0] == "GET" && request[1] == route) {
        sendResponse(socket, 200, "text/html; charset=utf-8", m_meetingHtml); return;
    }
    if (request[0] == "POST" && request[1] == route + "event"
        && origin == "http://" + expectedHost) {
        const QJsonObject event = QJsonDocument::fromJson(buffer.mid(split + 4, contentLength)).object();
        const QString name = event.value("name").toString();
        const QVariantMap data = event.value("data").toObject().toVariantMap();
        if (name == "joined") markJoined();
        const QString host = QUrl(m_activeRoom.value("server").toString()).host();
        if (name == "token" && m_logins) m_logins->update(host, {{"jwt", data.value("jwt").toString()}});
        // A login the server accepted is saved; one it refused is forgotten.
        if (name == "credentials" && m_logins) {
            m_logins->update(host, {{"username", data.value("username").toString()},
                                    {"password", data.value("password").toString()}});
        }
        if (name == "log") appendCallLog(data.value("message").toString());
        if (name == "screenShare" && m_screen) {
            if (data.value("active").toBool()) m_screen->start();
            else m_screen->stop();
        }
        sendResponse(socket, 200, "application/json", "{}");
        emit conferenceEvent(name, data);
        return;
    }
    if (request[0] == "GET" && request[1].startsWith(route + "screen.jpg")) {
        // The latest screen sharing frame: 204 while none arrived yet, 503
        // with the reason when the capture failed.
        const QString failure = m_screen ? m_screen->error() : QStringLiteral("Screen capture is not available");
        if (!failure.isEmpty()) { sendResponse(socket, 503, "text/plain; charset=utf-8", failure.toUtf8()); return; }
        quint64 serial = 0;
        const QByteArray jpeg = m_screen->frame(&serial);
        if (jpeg.isEmpty()) { sendResponse(socket, 204, "text/plain", QByteArray()); return; }
        sendResponse(socket, 200, "image/jpeg", jpeg);
        return;
    }
    if (request[0] == "GET" && request[1].startsWith(route)) {
        // Static files of the call page (qml/call). Only plain relative
        // paths inside that directory are served.
        const QString path = QString::fromUtf8(request[1].mid(route.size()));
        static const QRegularExpression allowed("^[A-Za-z0-9_-]+(/[A-Za-z0-9_.-]+)*\\.(js|css|svg|json|png)$");
        if (allowed.match(path).hasMatch() && !path.contains("..")) {
            QFile asset(Aurora::Application::pathTo("qml/call/" + path).toLocalFile());
            if (asset.open(QIODevice::ReadOnly)) {
                static const QHash<QString, QByteArray> types {
                    {"js", "text/javascript; charset=utf-8"}, {"css", "text/css; charset=utf-8"},
                    {"svg", "image/svg+xml"}, {"json", "application/json; charset=utf-8"}, {"png", "image/png"}
                };
                sendResponse(socket, 200, types.value(path.section('.', -1)), asset.readAll());
                return;
            }
        }
    }
    appendCallLog(QStringLiteral("local server 404: %1 %2").arg(QString::fromUtf8(request[0]), QString::fromUtf8(request[1])));
    sendResponse(socket, 404, "text/plain", "Not found");
}
