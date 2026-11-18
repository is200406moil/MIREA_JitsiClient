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
#include <QTimeZone>
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
    // Earlier versions kept the stream key here in the open. It is not moved:
    // it would not be known which server it may be given to.
    if (m_store.value("liveStreamKey").isValid()) m_store.erase("liveStreamKey");
    m_rooms = m_store.rooms();
    m_scheduled = QJsonDocument::fromJson(m_store.value("scheduled", "[]").toString().toUtf8()).array().toVariantList();
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
    return values;
}

bool AppState::setPreference(const QString &key, const QVariant &value)
{
    const QVariantMap current = preferences();
    if (!current.contains(key)) return false;
    if (key == "language") {
        if (value.toString() != "ru" && value.toString() != "en") return false;
        m_store.setValue(key, value.toString());
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

bool AppState::addScheduled(const QString &input, const QString &title, qint64 start, int minutes, int remind)
{
    const QVariantMap room = saveRoom(input, false);
    if (room.isEmpty()) return false;
    if (start <= 0 || minutes <= 0 || minutes > 24 * 60 || remind < 0 || remind > 24 * 60) {
        setError(tr("Проверьте дату и время встречи."));
        return false;
    }
    QVariantMap meeting;
    meeting["id"] = QUuid::createUuid().toString().mid(1, 36);
    meeting["room"] = room.value("name");
    meeting["server"] = room.value("server");
    meeting["link"] = room.value("server").toString() + "/" + QString::fromLatin1(QUrl::toPercentEncoding(room.value("name").toString()));
    meeting["title"] = title.trimmed().isEmpty() ? room.value("name").toString() : title.trimmed().left(200);
    meeting["start"] = start;
    meeting["minutes"] = minutes;
    meeting["remind"] = remind;
    m_scheduled.append(meeting);
    std::stable_sort(m_scheduled.begin(), m_scheduled.end(), [](const QVariant &a, const QVariant &b) {
        return a.toMap().value("start").toLongLong() < b.toMap().value("start").toLongLong();
    });
    storeScheduled();
    setError(QString());
    return true;
}

void AppState::removeScheduled(const QString &id)
{
    for (int i = 0; i < m_scheduled.size(); ++i) {
        if (m_scheduled.at(i).toMap().value("id").toString() == id) {
            m_scheduled.removeAt(i);
            storeScheduled();
            return;
        }
    }
}

void AppState::storeScheduled()
{
    // Meetings that ended more than a day ago are dropped.
    const qint64 old = QDateTime::currentMSecsSinceEpoch() - 24 * 3600 * 1000LL;
    for (int i = m_scheduled.size() - 1; i >= 0; --i) {
        const QVariantMap meeting = m_scheduled.at(i).toMap();
        if (meeting.value("start").toLongLong() + meeting.value("minutes").toLongLong() * 60000 < old) m_scheduled.removeAt(i);
    }
    m_store.setValue("scheduled", QString::fromUtf8(QJsonDocument(QJsonArray::fromVariantList(m_scheduled)).toJson(QJsonDocument::Compact)));
    emit scheduledChanged();
}

QString AppState::exportScheduled(const QString &id)
{
    QVariantMap meeting;
    for (const QVariant &entry : m_scheduled) {
        if (entry.toMap().value("id").toString() == id) meeting = entry.toMap();
    }
    if (meeting.isEmpty()) return QString();
    // RFC 5545: escaped text, CRLF lines, UTC times.
    auto text = [](QString value) {
        value.replace("\\", "\\\\").replace(";", "\\;").replace(",", "\\,").replace("\n", "\\n");
        return value;
    };
    auto utc = [](qint64 ms) {
        return QDateTime::fromMSecsSinceEpoch(ms, Qt::UTC).toString("yyyyMMdd'T'HHmmss'Z'");
    };
    const qint64 start = meeting.value("start").toLongLong();
    const qint64 end = start + meeting.value("minutes").toLongLong() * 60000;
    const QString link = meeting.value("link").toString();
    QStringList lines {
        "BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//MIREA//Jitsi Meet for Aurora OS//RU", "METHOD:PUBLISH",
        "BEGIN:VEVENT",
        "UID:" + meeting.value("id").toString() + "@ru.mirea.JitsiClient",
        "DTSTAMP:" + utc(QDateTime::currentMSecsSinceEpoch()),
        "DTSTART:" + utc(start), "DTEND:" + utc(end),
        "SUMMARY:" + text(meeting.value("title").toString()),
        "LOCATION:" + text(link), "URL:" + link,
        "DESCRIPTION:" + text(tr("Встреча Jitsi: %1").arg(link))
    };
    const int remind = meeting.value("remind").toInt();
    if (remind > 0) {
        lines << "BEGIN:VALARM" << "ACTION:DISPLAY" << QString("TRIGGER:-PT%1M").arg(remind)
              << "DESCRIPTION:" + text(meeting.value("title").toString()) << "END:VALARM";
    }
    lines << "END:VEVENT" << "END:VCALENDAR";
    QString folder = QStandardPaths::writableLocation(QStandardPaths::DownloadLocation);
    if (folder.isEmpty()) folder = QDir::homePath() + "/Downloads";
    QDir().mkpath(folder);
    QString base = meeting.value("title").toString();
    base.replace(QRegularExpression("[^\\w\\- ]"), "_");
    const QString path = folder + "/" + base.left(60).trimmed() + ".ics";
    QFile file(path);
    if (!file.open(QIODevice::WriteOnly | QIODevice::Truncate)) {
        setError(tr("Не удалось сохранить событие: %1").arg(file.errorString()));
        return QString();
    }
    // Lines longer than 75 octets are folded as RFC 5545 requires.
    QByteArray data;
    for (const QString &line : lines) {
        QByteArray bytes = line.toUtf8();
        while (bytes.size() > 74) {
            int cut = 74;
            while (cut > 0 && (static_cast<unsigned char>(bytes.at(cut)) & 0xC0) == 0x80) --cut;
            data += bytes.left(cut) + "\r\n ";
            bytes = bytes.mid(cut);
        }
        data += bytes + "\r\n";
    }
    file.write(data);
    file.close();
    setError(QString());
    return QUrl::fromLocalFile(path).toString();
}

QVariantMap AppState::importCalendarFile(const QString &path)
{
    QFile file(path);
    if (!file.open(QIODevice::ReadOnly)) {
        return {{"ok", false}, {"error", tr("Не удалось открыть файл: %1").arg(file.errorString())}};
    }
    if (file.size() > 1024 * 1024) return {{"ok", false}, {"error", tr("Файл события слишком большой.")}};
    return importCalendarText(QString::fromUtf8(file.readAll()));
}

QVariantMap AppState::importCalendarText(const QString &text)
{
    auto fail = [](const QString &error) { return QVariantMap {{"ok", false}, {"error", error}}; };
    // RFC 5545: unfolded lines, NAME;PARAM=...:VALUE, the first VEVENT.
    QString unfolded = text;
    unfolded.replace("\r\n", "\n").replace('\r', '\n');
    unfolded.replace(QRegularExpression("\n[ \t]"), QString());
    struct Property { QString name; QMap<QString, QString> params; QString value; };
    QList<Property> event;
    bool inEvent = false, inAlarm = false, done = false;
    int remind = 0;
    for (const QString &line : unfolded.split('\n')) {
        if (done || line.isEmpty()) continue;
        const int colon = line.indexOf(':');
        if (colon <= 0) continue;
        const QStringList head = line.left(colon).split(';');
        Property property { head.first().toUpper(), {}, line.mid(colon + 1) };
        for (int i = 1; i < head.size(); ++i) {
            const int eq = head.at(i).indexOf('=');
            if (eq > 0) property.params.insert(head.at(i).left(eq).toUpper(), head.at(i).mid(eq + 1).remove('"'));
        }
        const QString value = property.value.trimmed().toUpper();
        if (property.name == "BEGIN" && value == "VEVENT") { inEvent = true; continue; }
        if (!inEvent) continue;
        if (property.name == "BEGIN" && value == "VALARM") { inAlarm = true; continue; }
        if (property.name == "END" && value == "VALARM") { inAlarm = false; continue; }
        if (property.name == "END" && value == "VEVENT") { done = true; continue; }
        if (inAlarm) {
            // The first reminder before the start: TRIGGER:-PT10M, -PT1H, -P1D.
            static const QRegularExpression trigger("^-P(?:(\\d+)D)?(?:T(?:(\\d+)H)?(?:(\\d+)M)?)?");
            const QRegularExpressionMatch match = trigger.match(property.value.trimmed());
            if (property.name == "TRIGGER" && match.hasMatch() && !remind) {
                remind = match.captured(1).toInt() * 1440 + match.captured(2).toInt() * 60 + match.captured(3).toInt();
            }
            continue;
        }
        event << property;
    }
    if (event.isEmpty()) return fail(tr("В файле нет события календаря."));

    auto find = [&event](const QString &name) {
        for (const Property &property : event) if (property.name == name) return property;
        return Property();
    };
    auto unescape = [](QString value) {
        value.replace("\\n", "\n").replace("\\N", "\n").replace("\\,", ",").replace("\\;", ";").replace("\\\\", "\\");
        return value.trimmed();
    };
    // A UTC time (…Z), a time in TZID or a floating local time; a date alone
    // is the start of that day.
    auto time = [](const Property &property) -> QDateTime {
        const QString value = property.value.trimmed();
        if (value.size() == 8) {
            return QDateTime(QDate::fromString(value, "yyyyMMdd"), QTime(0, 0), Qt::LocalTime);
        }
        QDateTime result = QDateTime::fromString(value.left(15), "yyyyMMdd'T'HHmmss");
        if (!result.isValid()) return QDateTime();
        if (value.endsWith('Z')) {
            result.setTimeSpec(Qt::UTC);
        } else if (property.params.contains("TZID")) {
            QTimeZone zone(property.params.value("TZID").toUtf8());
            if (zone.isValid()) result.setTimeZone(zone);
        }
        return result;
    };
    const QDateTime start = time(find("DTSTART"));
    if (!start.isValid()) return fail(tr("У события нет времени начала."));
    QDateTime end = time(find("DTEND"));
    if (!end.isValid()) {
        static const QRegularExpression duration("^P(?:(\\d+)D)?(?:T(?:(\\d+)H)?(?:(\\d+)M)?)?");
        const QRegularExpressionMatch match = duration.match(find("DURATION").value.trimmed());
        const int minutes = match.hasMatch()
            ? match.captured(1).toInt() * 1440 + match.captured(2).toInt() * 60 + match.captured(3).toInt() : 60;
        end = start.addSecs(60LL * (minutes > 0 ? minutes : 60));
    }
    static const QRegularExpression linkPattern("https://[^\\s<>\"'\\\\]+", QRegularExpression::CaseInsensitiveOption);
    QString link;
    for (const QString &name : {QStringLiteral("URL"), QStringLiteral("LOCATION"), QStringLiteral("DESCRIPTION")}) {
        const QRegularExpressionMatch match = linkPattern.match(unescape(find(name).value));
        if (match.hasMatch()) {
            link = match.captured(0);
            while (!link.isEmpty() && QStringLiteral(".,;:!?)]}").contains(link.at(link.size() - 1))) link.chop(1);
            break;
        }
    }
    if (link.isEmpty()) return fail(tr("В событии нет ссылки на встречу."));
    const QVariantMap room = saveRoom(link, false);
    if (room.isEmpty()) return fail(lastError());

    const QString uid = unescape(find("UID").value);
    const QString title = unescape(find("SUMMARY").value);
    const qint64 startMs = start.toMSecsSinceEpoch();
    const int minutes = int(qBound<qint64>(1, start.secsTo(end) / 60, 24 * 60));
    for (int i = 0; i < m_scheduled.size(); ++i) {
        QVariantMap meeting = m_scheduled.at(i).toMap();
        if (!uid.isEmpty() && meeting.value("uid").toString() == uid) {
            // An updated invitation moves the meeting.
            meeting["start"] = startMs;
            meeting["minutes"] = minutes;
            if (!title.isEmpty()) meeting["title"] = title.left(200);
            m_scheduled[i] = meeting;
            storeScheduled();
            return {{"ok", true}, {"duplicate", true}, {"title", meeting.value("title")}, {"start", startMs},
                    {"link", meeting.value("link")}};
        }
    }
    if (!addScheduled(link, title, startMs, minutes, remind)) return fail(lastError());
    // The meeting just added (addScheduled sorts the list) keeps the UID.
    const QString added = room.value("server").toString() + "/" + QString::fromLatin1(QUrl::toPercentEncoding(room.value("name").toString()));
    for (int i = 0; i < m_scheduled.size(); ++i) {
        QVariantMap meeting = m_scheduled.at(i).toMap();
        if (meeting.value("start").toLongLong() == startMs && meeting.value("link").toString() == added
                && meeting.value("uid").toString().isEmpty()) {
            meeting["uid"] = uid;
            m_scheduled[i] = meeting;
            break;
        }
    }
    storeScheduled();
    return {{"ok", true}, {"duplicate", false}, {"title", title.isEmpty() ? room.value("name") : QVariant(title)},
            {"start", startMs}, {"link", added}};
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
    // Only the key typed for this server: the page runs code of the server.
    config["liveStreamKey"] = saved.value("liveStreamKey").toString();
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
    // The Gecko WebView of Aurora OS 5.1 gets no camera frames on some
    // devices; the app takes the camera then (NativeCamera).
    config["nativeCamera"] = m_camera != nullptr;
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

QString AppState::screenShareTitle() const
{
    return tr("Показать экран?");
}

QString AppState::screenShareText() const
{
    return tr("Сервер %1 запрашивает показ экрана. Участники встречи увидят всё, что на нём происходит.")
        .arg(QUrl(m_activeRoom.value("server").toString()).host());
}

void AppState::answerScreenShare(bool allow)
{
    if (m_screenShare != ScreenShareWaiting) return;
    if (allow && m_screen) {
        m_screenShare = ScreenShareAllowed;
        m_screen->start();
    } else {
        m_screenShare = ScreenShareRefused;
    }
}

void AppState::finishMeeting()
{
    if (m_screen) m_screen->stop();
    m_screenShare = ScreenShareNone;
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
    QByteArray referer;
    QByteArray host;
    for (const QByteArray &line : lines) {
        const int colon = line.indexOf(':');
        if (colon < 0) continue;
        const QByteArray key = line.left(colon).trimmed().toLower();
        const QByteArray value = line.mid(colon + 1).trimmed();
        if (key == "content-length") contentLength = value.toInt();
        if (key == "origin") origin = value;
        if (key == "referer") referer = value;
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
    // Chromium sends Origin with the page's events; Gecko 78 (Aurora OS 5.1)
    // sends none for a same-origin request, only Referer. The random route
    // keeps other pages and processes out either way.
    const QByteArray page = "http://" + expectedHost + route;
    const bool fromPage = origin.isEmpty() ? referer.startsWith(page) : origin == "http://" + expectedHost;
    if (request[0] == "POST" && request[1] == route + "event" && fromPage) {
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
        if (name == "liveStreamKey" && m_logins && data.value("key").toString().size() <= 1024) {
            m_logins->update(host, {{"liveStreamKey", data.value("key").toString().trimmed()}});
        }
        if (name == "log") appendCallLog(data.value("message").toString());
        if (name == "screenShare" && m_screen) {
            if (!data.value("active").toBool()) {
                m_screen->stop();
                m_screenShare = ScreenShareNone;
            } else if (m_screenShare != ScreenShareAllowed) {
                m_screenShare = ScreenShareWaiting;
            }
        }
        sendResponse(socket, 200, "application/json", "{}");
        emit conferenceEvent(name, data);
        return;
    }
    if (request[0] == "GET" && request[1].startsWith(route + "camera.jpg")) {
        // The latest camera frame: 204 while none arrived yet, 503 with the
        // reason when the camera failed. The camera runs only after the page
        // asked for it (nativeCamera event, handled in RoomPage.qml).
        if (!m_camera) { sendResponse(socket, 404, "text/plain", QByteArray()); return; }
        const QString failure = m_camera->error();
        if (!failure.isEmpty()) { sendResponse(socket, 503, "text/plain; charset=utf-8", failure.toUtf8()); return; }
        const QByteArray jpeg = m_camera->frame(nullptr);
        if (jpeg.isEmpty()) { sendResponse(socket, 204, "text/plain", QByteArray()); return; }
        sendResponse(socket, 200, "image/jpeg", jpeg);
        return;
    }
    if (request[0] == "GET" && request[1].startsWith(route + "screen.jpg")) {
        // No frames without the user's answer: 202 while the question is
        // open, 403 otherwise.
        if (m_screenShare == ScreenShareWaiting) { sendResponse(socket, 202, "text/plain", QByteArray()); return; }
        if (m_screenShare != ScreenShareAllowed) { sendResponse(socket, 403, "text/plain", QByteArray()); return; }
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
        static const QRegularExpression allowed("^[A-Za-z0-9_-]+(/[A-Za-z0-9_.-]+)*\\.(js|css|svg|json|png|ttf)$");
        if (allowed.match(path).hasMatch() && !path.contains("..")) {
            QFile asset(Aurora::Application::pathTo("qml/call/" + path).toLocalFile());
            if (asset.open(QIODevice::ReadOnly)) {
                static const QHash<QString, QByteArray> types {
                    {"js", "text/javascript; charset=utf-8"}, {"css", "text/css; charset=utf-8"},
                    {"svg", "image/svg+xml"}, {"json", "application/json; charset=utf-8"}, {"png", "image/png"},
                    {"ttf", "font/ttf"}
                };
                sendResponse(socket, 200, types.value(path.section('.', -1)), asset.readAll());
                return;
            }
        }
    }
    appendCallLog(QStringLiteral("local server 404: %1 %2").arg(QString::fromUtf8(request[0]), QString::fromUtf8(request[1])));
    sendResponse(socket, 404, "text/plain", "Not found");
}
