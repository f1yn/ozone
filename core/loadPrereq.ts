/**
 * Load in and initialize any code that needs to be run before the Ozone core init happens (like logger configuration)
 */

import { log, colors } from '@o3/deps.ts';
import { getOzoneTextLogo } from '@o3/docs/logos/logo.ts';

import {
    OZONE_SECRET_NAME,
} from "./constants.ts";

/**
 * Loads and writes the local ozone logo to stdout. Used a a way to determine if we're using a full git tree,
 * as people trying to "shave the fat" will likely drop @o3/docs
 */
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

export async function setupOzoneLogging() {
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
            intent: {
                level: defaultLoggingLevel,
                handlers: ["console"],
            },
            arterial: {
                level: defaultLoggingLevel,
                handlers: ["console"],
            },
        },
    });
}

/**
 * Sets up one-off and singleton dependencies (such as Deno logging)
 * @returns 
 */
export async function loadOzonePrerequisites() {
    await setupOzoneLogging();
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

/**
 * Load a container secret from disk (works on Docker and Podman)
 * @param secretName
 */
const loadSecretFromFilesystem = (secretName : string) => Deno.readTextFile(`/run/secrets/${secretName}`);

export interface OzoneCoreConfiguration {
    socketPort: number,
    secret: string,
}

/**
 * Loads all init configuration needed for the core init (such as the service secret, port)
 * @returns 
 */
export async function loadOzoneConfiguration() : Promise<OzoneCoreConfiguration>{
    const logger = log.getLogger('init');

    logger.debug('Attempting to load secret from filesystem');
    const secret = await loadSecretFromFilesystem(OZONE_SECRET_NAME);
    logger.debug('Secret was successfully loaded from filesystem');

    return {
        secret,
        socketPort: 1122,
    }
}