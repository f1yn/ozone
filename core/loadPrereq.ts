/**
 * Load in and initialize any code that needs to be run before the Ozone core init happens (like logger configuration)
 */

import { log, colors } from './deps.ts';
import { getOzoneTextLogo } from '@o3/docs/logos/logo.ts';

async function prettyPrintOzoneLogo() {
    // create text encoder
    const textEncoder = new TextEncoder();
    let lineIndex = 0;

    // get the ozoneTextLogo
    for (const line of getOzoneTextLogo().split('\n')) {
        let formattedLine = line;

        if ([1, 2, 26, 27].includes(lineIndex)) {
            formattedLine = colors.green(formattedLine);
        } else {
            formattedLine = line
                // borrowed from the v1 Ozone implementation
                .replace(/[xk]{1,}[xk]/g, (match) => {
                    return colors.green(match);
                })
        }

        await Deno.stdout.write(textEncoder.encode(lineIndex + '  ' + formattedLine + '\n'));
        lineIndex += 1;
    }
}

export async function loadOzonePrerequisites() {
    // Init logger
    const defaultLoggingLevel = 'DEBUG'

    await log.setup({
        handlers: {
            console: new log.handlers.ConsoleHandler("DEBUG", {
                formatter: "[{levelName}:{loggerName}] {msg}",
            }),
        },
        loggers: {
            // configure default logger available via short-hand methods above.
            default: {
                level: defaultLoggingLevel,
                handlers: ["console"],
            },
            init: {
                level: defaultLoggingLevel,
                handlers: ["console"],
            },
            event: {
                level: defaultLoggingLevel,
                handlers: ["console"],
            },
            arterial: {
                level: defaultLoggingLevel,
                handlers: ["console"],
            },
        },
    });

    const initLogger = log.getLogger('init');

    // Pretty-print the ozone logo
    // This might seem silly, but this helps guarantee that the Ozone repo was correctly
    // installed for the core - which is ESSENTIAL for the core to function as intended.

    try {
        await prettyPrintOzoneLogo();
    } catch (logoPrintError) {
        initLogger.critical([
            'The Ozone logo failed to render, which means you are:',
            " 1. using a badly configured Ozone installation and didn't follow instructions correctly",
            " 2. the Ozone core code has been tampered with and should NOT be used (use a new image or refresh)",
            " 3. container issues (filesystem corruption, broken mounts)",
            "Please consult the Ozone README for more information"
        ].join('\n'))
        initLogger.critical(logoPrintError);
    }

    return [initLogger];
}