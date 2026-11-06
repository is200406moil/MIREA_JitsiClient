# Contributing

## Reporting a problem

Open an issue and include the Aurora OS version, the device or emulator, the Jitsi server, the steps to reproduce and the meeting log `~/.cache/ru.vkr/JitsiAuroraPrototype/call.log`. Remove passwords and tokens from the log first.

## Proposing a change

1. Create a branch from `main`.
2. Build the package for the `x86_64` and `aarch64` targets. See [Build](README.md#build).
3. Check that the package passes the validator: `sfdk check RPMS/<package>.rpm`.
4. Run the unit tests described in [doc/testing.md](doc/testing.md).
5. Check the change on the emulator or a device, on a real Jitsi server.
6. Open a pull request that says what was changed and how it was checked.

## Code rules

- Follow the behaviour of the Jitsi mobile client, and use Jitsi's own strings where they exist.
- Use only libraries with permissive licenses, and add each new one to [LICENSE.md](LICENSE.md).
- Do not commit build results, signing keys, passwords or stream keys.
- Update [README.md](README.md), [README.ru.md](README.ru.md) and `doc/` when behaviour changes.

Contributions are accepted under the [BSD 3-Clause License](LICENSE.md).
