#pragma once
#include <QTranslator>
#include <QFile>
#include <QJsonDocument>
#include <QJsonObject>

// The same Russian UI phrase has the same meaning across the native screens.
// Use QTranslator so qsTr() and C++ tr() keep their normal fallback behavior.
class ClientTranslator : public QTranslator
{
public:
    explicit ClientTranslator(const QString &path, QObject *parent = nullptr) : QTranslator(parent)
    {
        QFile file(path);
        if (file.open(QIODevice::ReadOnly)) m_english = QJsonDocument::fromJson(file.readAll()).object();
    }
    bool isEmpty() const override { return m_english.isEmpty(); }
    QString translate(const char *, const char *source, const char * = nullptr, int = -1) const override
    { return m_english.value(QString::fromUtf8(source)).toString(); }
private:
    QJsonObject m_english;
};
