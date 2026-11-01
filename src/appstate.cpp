#include "appstate.h"

#include <QCryptographicHash>
#include <QClipboard>
#include <QDateTime>
#include <QFile>
#include <QGuiApplication>
#include <QJsonArray>
#include <QJsonDocument>
#include <QJsonObject>
#include <QLocale>
#include <QNetworkReply>
#include <QNetworkRequest>
#include <QRegularExpression>
#include <QTcpSocket>
#include <QTimer>
#include <QUrl>
#include <QUrlQuery>
#include <QUuid>
#include <auroraapp.h>
#include <algorithm>

AppState::AppState(QObject *parent, const QString &settingsFile) : QObject(parent)
{
    m_settings = settingsFile.isEmpty()
        ? new QSettings(this)
        : new QSettings(settingsFile, QSettings::IniFormat, this);
    m_rooms = QJsonDocument::fromJson(m_settings->value("client/rooms").toByteArray()).array().toVariantList();
    connect(&m_http, &QTcpServer::newConnection, this, &AppState::acceptConnection);
}

QString AppState::displayName() const { return m_settings->value("client/name").toString(); }
QString AppState::email() const { return m_settings->value("client/email").toString(); }
QString AppState::server() const
{
    const QString saved = m_settings->value("client/server").toString();
    return saved == "https://meet.jit.si" ? QString() : saved;
}
bool AppState::audioMuted() const { return m_settings->value("client/audioMuted", false).toBool(); }
bool AppState::videoMuted() const { return m_settings->value("client/videoMuted", false).toBool(); }

QVariantMap AppState::preferences() const
{
    QVariantMap values;
    const QStringList falseDefaults = { "hideSelfView", "lowBandwidth", "audioMuted", "videoMuted", "disableP2p" };
    const QStringList trueDefaults = { "soundReactions", "soundMessage", "soundJoined", "soundLeft",
                                      "soundTalkMuted", "soundLobby", "chatNotifications" };
    for (const QString &key : falseDefaults) values[key] = m_settings->value("client/" + key, false).toBool();
    for (const QString &key : trueDefaults) values[key] = m_settings->value("client/" + key, true).toBool();
    values["language"] = m_settings->value("client/language", "ru").toString();
    return values;
}

bool AppState::setPreference(const QString &key, const QVariant &value)
{
    const QVariantMap current = preferences();
    if (!current.contains(key)) return false;
    if (key == "language") {
        if (value.toString() != "ru" && value.toString() != "en") return false;
        m_settings->setValue("client/" + key, value.toString());
    } else {
        if (value.type() != QVariant::Bool) return false;
        m_settings->setValue("client/" + key, value.toBool());
    }
    m_settings->sync();
    emit settingsChanged();
    if (key == "language" && current.value(key) != value) emit interfaceLanguageChanged();
    return true;
}

QString AppState::roomSection(qint64 timestamp) const
{
    if (!timestamp) return tr("Ранее");
    const QDate date = QDateTime::fromMSecsSinceEpoch(timestamp).date();
    if (date == QDate::currentDate()) return tr("Сегодня");
    if (date == QDate::currentDate().addDays(-1)) return tr("Вчера");
    return tr("Ранее");
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

void AppState::fetchDialInInfo(const QVariantMap &room)
{
    const int requestId = ++m_dialInRequestId;
    const QString roomName = room.value("name").toString();
    const QString serverAddress = normalizedServer(room.value("server").toString());
    m_dialInInfo = {{"room", roomName}, {"loading", true}, {"numbers", QVariantList()}};
    emit dialInInfoChanged();
    if (roomName.isEmpty() || serverAddress.isEmpty()) {
        m_dialInInfo["loading"] = false;
        emit dialInInfoChanged();
        return;
    }
    if (serverAddress == QStringLiteral("https://meet.jit.si")) {
        requestDialInEndpoints(roomName, serverAddress,
            QStringLiteral("https://api.jitsi.net/phoneNumberList"),
            QStringLiteral("https://api.jitsi.net/conferenceMapper"), requestId);
        return;
    }
    QNetworkReply *configReply = m_network.get(QNetworkRequest(QUrl(serverAddress + "/config.js")));
    connect(configReply, &QNetworkReply::finished, this, [this, configReply, roomName, serverAddress, requestId]() {
        const QString config = QString::fromUtf8(configReply->readAll());
        const bool ok = configReply->error() == QNetworkReply::NoError;
        configReply->deleteLater();
        if (requestId != m_dialInRequestId) return;
        const QRegularExpression numbersPattern("dialInNumbersUrl\\s*:\\s*['\"](https://[^'\"]+)['\"]");
        const QRegularExpression codePattern("dialInConfCodeUrl\\s*:\\s*['\"](https://[^'\"]+)['\"]");
        const auto numbers = numbersPattern.match(config);
        const auto code = codePattern.match(config);
        if (!ok || !numbers.hasMatch() || !code.hasMatch()) {
            m_dialInInfo["loading"] = false;
            emit dialInInfoChanged();
            return;
        }
        requestDialInEndpoints(roomName, serverAddress, numbers.captured(1), code.captured(1), requestId);
    });
}

void AppState::requestDialInEndpoints(const QString &roomName, const QString &serverAddress,
                                      const QString &numbersUrl, const QString &codeUrl, int requestId)
{
    const QString host = QUrl(serverAddress).host();
    const QString conference = roomName + "@conference." + host;
    m_dialInPending = 2;
    auto complete = [this, requestId]() {
        if (requestId != m_dialInRequestId) return;
        if (--m_dialInPending == 0) {
            m_dialInInfo["loading"] = false;
            emit dialInInfoChanged();
        }
    };
    QUrl numberEndpoint(numbersUrl);
    QUrlQuery numberQuery(numberEndpoint);
    numberQuery.addQueryItem("conference", conference);
    numberEndpoint.setQuery(numberQuery);
    QNetworkReply *numbersReply = m_network.get(QNetworkRequest(numberEndpoint));
    connect(numbersReply, &QNetworkReply::finished, this, [this, numbersReply, requestId, complete]() {
        const QByteArray body = numbersReply->readAll();
        const bool ok = numbersReply->error() == QNetworkReply::NoError;
        numbersReply->deleteLater();
        if (requestId != m_dialInRequestId) return;
        if (ok) {
            const QJsonObject response = QJsonDocument::fromJson(body).object();
            QVariantList rows;
            const QJsonObject countries = response.value("numbers").toObject();
            QStringList order = {"US", "UK", "France", "Netherlands", "Spain", "Canada", "Australia", "Brazil"};
            for (const QString &country : countries.keys()) if (!order.contains(country)) order.append(country);
            for (const QString &country : order) {
                for (const QJsonValue &number : countries.value(country).toArray())
                    rows.append(QVariantMap{{"country", country}, {"number", number.toString()}});
            }
            if (response.value("numbersEnabled").toBool()) m_dialInInfo["numbers"] = rows;
        }
        complete();
    });
    QUrl codeEndpoint(codeUrl);
    QUrlQuery codeQuery(codeEndpoint);
    codeQuery.addQueryItem("conference", conference);
    codeQuery.addQueryItem("url", serverAddress + "/" + QString::fromLatin1(QUrl::toPercentEncoding(roomName)));
    codeEndpoint.setQuery(codeQuery);
    QNetworkReply *codeReply = m_network.get(QNetworkRequest(codeEndpoint));
    connect(codeReply, &QNetworkReply::finished, this, [this, codeReply, requestId, complete]() {
        const QByteArray body = codeReply->readAll();
        const bool ok = codeReply->error() == QNetworkReply::NoError;
        codeReply->deleteLater();
        if (requestId != m_dialInRequestId) return;
        if (ok) {
            const QJsonValue id = QJsonDocument::fromJson(body).object().value("id");
            if (id.isString()) m_dialInInfo["pin"] = id.toString();
            else if (id.isDouble()) m_dialInInfo["pin"] = QString::number(qint64(id.toDouble()));
        }
        complete();
    });
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
    m_settings->setValue("client/name", name.trimmed().left(100));
    m_settings->setValue("client/email", cleanedMail);
    m_settings->sync();
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
    if (normalized.isEmpty() || normalized == "https://meet.jit.si") m_settings->remove("client/server");
    else m_settings->setValue("client/server", normalized);
    m_settings->setValue("client/audioMuted", muteAudio);
    m_settings->setValue("client/videoMuted", muteVideo);
    m_settings->sync();
    setError(QString());
    emit settingsChanged();
    return true;
}

QVariantMap AppState::saveRoom(const QString &input, bool remember)
{
    QString name = input.trimmed();
    QString address = server().isEmpty() ? QStringLiteral("https://meet.jit.si") : server();
    if (name.startsWith("https://", Qt::CaseInsensitive)) {
        const QUrl link(name, QUrl::StrictMode);
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
        storeRooms();
    }
    setError(QString());
    return room;
}

void AppState::storeRooms()
{
    m_settings->setValue("client/rooms", QJsonDocument(QJsonArray::fromVariantList(m_rooms)).toJson(QJsonDocument::Compact));
    m_settings->sync();
    emit roomsChanged();
}

void AppState::removeRoom(const QString &id)
{
    for (int i = 0; i < m_rooms.size(); ++i) {
        if (m_rooms.at(i).toMap().value("id").toString() == id) {
            m_rooms.removeAt(i);
            storeRooms();
            return;
        }
    }
}

void AppState::importLegacy(const QString &json, const QString &name)
{
    if (m_settings->value("client/migrated", false).toBool()) return;
    if (displayName().isEmpty() && !name.trimmed().isEmpty()) m_settings->setValue("client/name", name.trimmed());
    for (const QJsonValue &entry : QJsonDocument::fromJson(json.toUtf8()).array()) {
        if (entry.isString()) saveRoom(entry.toString());
    }
    m_settings->setValue("client/migrated", true);
    m_settings->sync();
    emit profileChanged();
}

QString AppState::initials(const QString &name) const
{
    const QStringList parts = name.simplified().split(' ', QString::SkipEmptyParts);
    if (parts.isEmpty()) return "J";
    QString result = parts.first().left(1);
    if (parts.size() > 1) result += parts.last().left(1);
    return result.toUpper();
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

bool AppState::startMeeting(const QVariantMap &room, bool muteAudio, bool muteVideo)
{
    const QString address = normalizedServer(room.value("server").toString());
    if (address.isEmpty() || room.value("name").toString().isEmpty()) {
        setError(tr("Не удалось определить адрес комнаты.")); return false;
    }
    if (!m_http.isListening() && !m_http.listen(QHostAddress::LocalHost, 0)) {
        setError(tr("Не удалось подготовить встречу. Перезапустите приложение.")); return false;
    }
    QFile file(Aurora::Application::pathTo("qml/web/conference.html").toLocalFile());
    if (!file.open(QIODevice::ReadOnly)) { setError(tr("Не удалось загрузить экран встречи.")); return false; }
    m_activeRoom = room;
    bool remembered = false;
    for (const QVariant &entry : m_rooms) {
        if (entry.toMap().value("id") == room.value("id")) { remembered = true; break; }
    }
    if (!remembered) { m_rooms.prepend(room); storeRooms(); }
    m_meetingStarted = QDateTime::currentMSecsSinceEpoch();
    const QUrl url(address);
    m_meetingOrigin = url.adjusted(QUrl::RemovePath | QUrl::RemoveQuery | QUrl::RemoveFragment).toString(QUrl::StripTrailingSlash);
    m_route = "/meeting/" + QUuid::createUuid().toString().remove('{').remove('}') + "/";
    m_meetingUrl = QString("http://127.0.0.1:%1%2").arg(m_http.serverPort()).arg(m_route);
    QJsonObject config;
    config["server"] = address;
    config["room"] = room.value("name").toString();
    config["displayName"] = displayName();
    config["email"] = email();
    config["avatarURL"] = avatarUrl();
    config["audioMuted"] = muteAudio;
    config["videoMuted"] = muteVideo;
    config["preferences"] = QJsonObject::fromVariantMap(preferences());
    QByteArray json = QJsonDocument(config).toJson(QJsonDocument::Compact);
    json.replace("<", "\\u003c");
    json.replace(">", "\\u003e");
    json.replace("&", "\\u0026");
    m_meetingHtml = file.readAll().replace("__MEETING_CONFIG__", json);
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
    if (m_meetingStarted > 0) {
        for (int i = 0; i < m_rooms.size(); ++i) {
            QVariantMap room = m_rooms.at(i).toMap();
            if (room.value("id") == m_activeRoom.value("id")) {
                room["lastUsed"] = m_meetingStarted;
                room["duration"] = (QDateTime::currentMSecsSinceEpoch() - m_meetingStarted) / 1000;
                m_rooms[i] = room;
                storeRooms();
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
            storeRooms();
            break;
        }
    }
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
    if (host != expectedHost || m_route.isEmpty()) { sendResponse(socket, 404, "text/plain", "Not found"); return; }
    const QByteArray route = m_route.toUtf8();
    if (request[0] == "GET" && request[1] == route) {
        sendResponse(socket, 200, "text/html; charset=utf-8", m_meetingHtml); return;
    }
    if (request[0] == "POST" && request[1] == route + "event"
        && origin == "http://" + expectedHost) {
        const QJsonObject event = QJsonDocument::fromJson(buffer.mid(split + 4, contentLength)).object();
        const QString name = event.value("name").toString();
        if (name == "videoConferenceJoined") markJoined();
        sendResponse(socket, 200, "application/json", "{}");
        emit conferenceEvent(name, event.value("data").toObject().toVariantMap());
        return;
    }
    sendResponse(socket, 404, "text/plain", "Not found");
}
