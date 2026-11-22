Name:       ru.mirea.JitsiClient
Summary:    Клиент видеоконференций Jitsi Meet для Авроры
Version:    0.1
Release:    165
License:    BSD-3-Clause
URL:        https://auroraos.ru
Source0:    %{name}-%{version}.tar.bz2

# Aurora OS 5.2 build tools drop the whole changelog (_changelog_trimage -1),
# while its validator requires one (no-changelogname-tag).
%global _changelog_trimage 0

# Aurora OS 5.1 has only the Gecko based Sailfish WebView, later versions the
# Chromium based Aurora WebView. Taken from the build target, so the same
# spec builds both packages; --define 'gecko 0|1' overrides it.
%{!?gecko:%global gecko %(grep -c '^VERSION_ID=5[.]1[.]' /etc/os-release 2>/dev/null || true)}

# Bundled private libraries: the documented Aurora application packaging model.
%global __provides_exclude_from ^%{_datadir}/%{name}/lib/.*$
%global __requires_exclude ^(libgst.*|libyuv\\.so.*|liborc-0\\.4\\.so.*|libdrm\\.so.*|libjpeg\\.so.*)$


Requires:   sailfishsilica-qt5 >= 0.10.9
Requires:   qt5-qtmultimedia
Requires:   qt5-qtdeclarative-import-multimedia
Requires:   qt5-qtmultimedia-plugin-mediaservice-gstmediacapture
BuildRequires:  pkgconfig(auroraapp)
%if 0%{?gecko}
# Aurora OS 5.1: the Gecko based Sailfish WebView.
Requires:   sailfish-components-webview-qt5
%else
BuildRequires:  pkgconfig(aurorawebview)
%endif
BuildRequires:  pkgconfig(Qt5Core)
BuildRequires:  pkgconfig(Qt5Qml)
BuildRequires:  pkgconfig(Qt5Quick)
BuildRequires:  pkgconfig(Qt5Network)
BuildRequires:  pkgconfig(Qt5Sql)
BuildRequires:  pkgconfig(qca2-qt5)
BuildRequires:  pkgconfig(streamcamera)

%ifarch x86_64
BuildRequires:  pkgconfig(gstreamer-1.0)
BuildRequires:  streamcamera-gstreamer-camera-plugin
BuildRequires:  streamcamera-gstreamer-codec-plugin
%endif


%description
Приложение для видеовстреч Jitsi Meet с сохранением комнат на устройстве.


%prep
%autosetup

%build
# gecko is always defined (0 or 1), so its value is checked, not its presence.
%if 0%{?gecko}
%qmake5 VERSION=%{version} RELEASE=%{release} CONFIG+=gecko
%else
%qmake5 VERSION=%{version} RELEASE=%{release}
%endif
%make_build

%install
%make_install
# The debug symbols are not shipped (rpmlint: unstripped-binary-or-object).
%{__strip} --strip-unneeded %{buildroot}%{_bindir}/%{name}

%ifarch x86_64
private_libs=%{buildroot}%{_datadir}/%{name}/lib
mkdir -p "$private_libs/streamcamera" "%{buildroot}%{_datadir}/%{name}/licenses"
for library in libgstreamer-1.0.so.0 libgstallocators-1.0.so.0 libgstvideo-1.0.so.0 libgstbase-1.0.so.0 libgstphotography-1.0.so.0 libgstapp-1.0.so.0 libgstpbutils-1.0.so.0 libgstaudio-1.0.so.0 libgsttag-1.0.so.0 libyuv.so.0 liborc-0.4.so.0 libdrm.so.2 libjpeg.so.62; do
    install -m 644 "%{_libdir}/$library" "$private_libs/$library"
done
install -m 644 %{_libdir}/streamcamera/plugins/libstreamcamera-gstreamer-camera.so "$private_libs/streamcamera/"
install -m 644 %{_libdir}/streamcamera/plugins/libstreamcamera-gstreamer-codec.so "$private_libs/streamcamera/"
for licensedir in %{_datadir}/licenses/gstreamer1.0-* %{_datadir}/licenses/streamcamera-gstreamer-* %{_datadir}/licenses/libyuv-* %{_datadir}/licenses/orc-* %{_datadir}/licenses/libdrm-* %{_datadir}/licenses/libjpeg-*; do
    if [ -d "$licensedir" ]; then cp -R "$licensedir" "%{buildroot}%{_datadir}/%{name}/licenses/"; fi
done
%endif

%files
%defattr(-,root,root,-)
%{_bindir}/%{name}
%defattr(644,root,root,-)
%{_datadir}/%{name}
%{_datadir}/applications/%{name}.desktop
%{_datadir}/icons/hicolor/*/apps/%{name}.png

%changelog
* Sun Nov 22 2026 Ghiyosidinov Ismoilkhuja <is200406moil@gmail.com> 0.1-165
- Build the Chromium variant for Aurora OS 5.2 again (the Gecko one was built by mistake)
- Remove a stale Chromium profile lock at start (a black meeting after a crash)
- Show all project files in the IDE and parse the project on the Windows host
- Keep the changelog in the Aurora OS 5.2 package

* Wed Nov 18 2026 Ghiyosidinov Ismoilkhuja <is200406moil@gmail.com> 0.1-163
- Remove the explicit library dependency, the duplicate icons and the debug symbols from the package

* Wed Nov 18 2026 Ghiyosidinov Ismoilkhuja <is200406moil@gmail.com> 0.1-162
- Show the planned meetings, the recent rooms and the meeting state on the cover

* Wed Nov 18 2026 Ghiyosidinov Ismoilkhuja <is200406moil@gmail.com> 0.1-161
- Open the tabs of the main screen from the cover actions

* Wed Nov 18 2026 Ghiyosidinov Ismoilkhuja <is200406moil@gmail.com> 0.1-160
- Plan meetings in the application with reminders
- Share invitations as iCalendar files and open them in the application

* Wed Nov 18 2026 Ghiyosidinov Ismoilkhuja <is200406moil@gmail.com> 0.1-157
- Colour emoji and emoji input in all text fields

* Wed Nov 18 2026 Ghiyosidinov Ismoilkhuja <is200406moil@gmail.com> 0.1-156
- Assign participants to breakout rooms
- Choose the recipient of a private message, search the chat, add smileys

* Wed Nov 18 2026 Ghiyosidinov Ismoilkhuja <is200406moil@gmail.com> 0.1-155
- Raise the minimum bandwidth estimate of Gecko

* Wed Nov 18 2026 Ghiyosidinov Ismoilkhuja <is200406moil@gmail.com> 0.1-154
- Meeting fixes on Aurora OS 5.1 and a tablet layout

* Tue Nov 17 2026 Ghiyosidinov Ismoilkhuja <is200406moil@gmail.com> 0.1-153
- Camera, microphone and whiteboard on Aurora OS 5.1

* Tue Nov 17 2026 Ghiyosidinov Ismoilkhuja <is200406moil@gmail.com> 0.1-142
- Build for Aurora OS 5.1 with the Gecko based Sailfish WebView
- Show other pages over the meeting on Aurora OS 5.1

* Sat Nov 07 2026 Ghiyosidinov Ismoilkhuja <is200406moil@gmail.com> 0.1-135
- Show the package version in the settings

* Sat Nov 07 2026 Ghiyosidinov Ismoilkhuja <is200406moil@gmail.com> 0.1-134
- Keep logins in a file encrypted with a key from Aurora Keystore

* Sat Nov 07 2026 Ghiyosidinov Ismoilkhuja <is200406moil@gmail.com> 0.1-133
- Rename the application to ru.mirea.JitsiClient

* Fri Nov 06 2026 Ghiyosidinov Ismoilkhuja <is200406moil@gmail.com> 0.1-132
- Correct the author name

* Fri Nov 06 2026 Ghiyosidinov Ismoilkhuja <is200406moil@gmail.com> 0.1-131
- Show the filmstrip of a one to one meeting like the mobile client and allow pinning yourself

* Fri Nov 06 2026 Ghiyosidinov Ismoilkhuja <is200406moil@gmail.com> 0.1-130
- Show the reason when the server refuses recording

* Fri Nov 06 2026 Ghiyosidinov Ismoilkhuja <is200406moil@gmail.com> 0.1-129
- Show audio level rings around the avatar of the speaker

* Fri Nov 06 2026 Ghiyosidinov Ismoilkhuja <is200406moil@gmail.com> 0.1-128
- Add file recording and a subtitles tab in the chat screen

* Fri Nov 06 2026 Ghiyosidinov Ismoilkhuja <is200406moil@gmail.com> 0.1-127
- Remove the Pictures, UserDirs and Audio permissions

* Fri Nov 06 2026 Ghiyosidinov Ismoilkhuja <is200406moil@gmail.com> 0.1-126
- Confirm screen sharing in an application dialog
- Keep saved logins when the key store does not answer
- Keep stream keys in the secure store, per server
- Show the connection indicator on participant tiles
