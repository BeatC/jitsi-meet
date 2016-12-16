/* global $, APP, JitsiMeetJS, config, interfaceConfig */
const logger = require('jitsi-meet-logger').getLogger(__filename);

/**
 * Known custom conference commands.
 */
const commands = {
    EMAIL: 'email',
    AVATAR_URL: 'avatar-url',
    AVATAR_ID: 'avatar-id',
    ETHERPAD: 'etherpad',
    SHARED_VIDEO: 'shared-video',
    CUSTOM_ROLE: 'custom-role'
};

/**
 * Max length of the display names. If we receive longer display name the
 * additional chars are going to be cut.
 */
const MAX_DISPLAY_NAME_LENGTH = 50;

/**
 * Open Connection. When authentication failed it shows auth dialog.
 *
 * @param roomName the room name to use
 * @returns Promise<JitsiConnection>
 */
function connect(roomName) {
    return openConnection({retry: true, roomName: roomName})
        .catch(function (err) {
            if (err === ConnectionErrors.PASSWORD_REQUIRED) {
                APP.UI.notifyTokenAuthFailed();
            } else {
                APP.UI.notifyConnectionFailed(err);
            }
            throw err;
        });
}

/**
 * Creates local media tracks and connects to room. Will show error
 * dialogs in case if accessing local microphone and/or camera failed. Will
 * show guidance overlay for users on how to give access to camera and/or
 * microphone,
 * @param {string} roomName
 * @returns {Promise.<JitsiLocalTrack[], JitsiConnection>}
 */
function createInitialLocalTracksAndConnect(roomName) {
    let audioAndVideoError,
        audioOnlyError;

    JitsiMeetJS.mediaDevices.addEventListener(
        JitsiMeetJS.events.mediaDevices.PERMISSION_PROMPT_IS_SHOWN,
        browser => APP.UI.showUserMediaPermissionsGuidanceOverlay(browser));

    // First try to retrieve both audio and video.
    let tryCreateLocalTracks = createLocalTracks(
        { devices: ['audio', 'video'] }, true)
        .catch(err => {
            // If failed then try to retrieve only audio.
            audioAndVideoError = err;
            return createLocalTracks({ devices: ['audio'] }, true);
        })
        .catch(err => {
            // If audio failed too then just return empty array for tracks.
            audioOnlyError = err;
            return [];
        });

    return Promise.all([ tryCreateLocalTracks, connect(roomName) ])
        .then(([tracks, con]) => {
            APP.UI.hideUserMediaPermissionsGuidanceOverlay();

            if (audioAndVideoError) {
                if (audioOnlyError) {
                    // If both requests for 'audio' + 'video' and 'audio' only
                    // failed, we assume that there is some problems with user's
                    // microphone and show corresponding dialog.
                    APP.UI.showDeviceErrorDialog(audioOnlyError, null);
                } else {
                    // If request for 'audio' + 'video' failed, but request for
                    // 'audio' only was OK, we assume that we had problems with
                    // camera and show corresponding dialog.
                    APP.UI.showDeviceErrorDialog(null, audioAndVideoError);
                }
            }

            return [tracks, con];
        });
}

/**
 * Share data to other users.
 * @param command the command
 * @param {string} value new value
 */
function sendData (command, value) {
    room.removeCommand(command);
    room.sendCommand(command, {value: value});
}

/**
 * Get user nickname by user id.
 * @param {string} id user id
 * @returns {string?} user nickname or undefined if user is unknown.
 */
function getDisplayName (id) {
    if (APP.conference.isLocalId(id)) {
        return APP.settings.getDisplayName();
    }

    let participant = room.getParticipantById(id);
    if (participant && participant.getDisplayName()) {
        return participant.getDisplayName();
    }
}

/**
 * Mute or unmute local audio stream if it exists.
 * @param {boolean} muted - if audio stream should be muted or unmuted.
 * @param {boolean} userInteraction - indicates if this local audio mute was a
 * result of user interaction
 */
function muteLocalAudio (muted) {
    muteLocalMedia(localAudio, muted, 'Audio');
}

function muteLocalMedia(localMedia, muted, localMediaTypeString) {
    if (!localMedia) {
        return;
    }

    const method = muted ? 'mute' : 'unmute';

    localMedia[method]().catch(reason => {
        logger.warn(`${localMediaTypeString} ${method} was rejected:`, reason);
    });
}

/**
 * Mute or unmute local video stream if it exists.
 * @param {boolean} muted if video stream should be muted or unmuted.
 */
function muteLocalVideo (muted) {
    muteLocalMedia(localVideo, muted, 'Video');
}

/**
 * Check if the welcome page is enabled and redirects to it.
 * If requested show a thank you dialog before that.
 * If we have a close page enabled, redirect to it without
 * showing any other dialog.
 *
 * @param {object} options used to decide which particular close page to show
 * or if close page is disabled, whether we should show the thankyou dialog
 * @param {boolean} options.thankYouDialogVisible - whether we should
 * show thank you dialog
 * @param {boolean} options.feedbackSubmitted - whether feedback was submitted
 */
function maybeRedirectToWelcomePage(options) {
    // if close page is enabled redirect to it, without further action
    if (config.enableClosePage) {
        if (options.feedbackSubmitted)
            window.location.pathname = "../../../../close.html";
        else
            window.location.pathname = "../../../../close2.html";
        return;
    }

    // else: show thankYou dialog only if there is no feedback
    if (options.thankYouDialogVisible)
        APP.UI.messageHandler.openMessageDialog(
            null, "dialog.thankYou", {appName:interfaceConfig.APP_NAME});

    // if Welcome page is enabled redirect to welcome page after 3 sec.
    if (config.enableWelcomePage) {
        setTimeout(() => {
            APP.settings.setWelcomePageEnabled(true);
            window.location.pathname = "/";
        }, 3000);
    }
}

/**
 * Create local tracks of specified types.
 * @param {Object} options
 * @param {string[]} options.devices - required track types
 *      ('audio', 'video' etc.)
 * @param {string|null} (options.cameraDeviceId) - camera device id, if
 *      undefined - one from settings will be used
 * @param {string|null} (options.micDeviceId) - microphone device id, if
 *      undefined - one from settings will be used
 * @param {boolean} (checkForPermissionPrompt) - if lib-jitsi-meet should check
 *      for gUM permission prompt
 * @returns {Promise<JitsiLocalTrack[]>}
 */
function createLocalTracks (options, checkForPermissionPrompt) {
    options || (options = {});

    return JitsiMeetJS
        .createLocalTracks({
            // copy array to avoid mutations inside library
            devices: options.devices.slice(0),
            resolution: config.resolution,
            cameraDeviceId: typeof options.cameraDeviceId === 'undefined' ||
            options.cameraDeviceId === null
                ? APP.settings.getCameraDeviceId()
                : options.cameraDeviceId,
            micDeviceId: typeof options.micDeviceId === 'undefined' ||
            options.micDeviceId === null
                ? APP.settings.getMicDeviceId()
                : options.micDeviceId,
            // adds any ff fake device settings if any
            firefox_fake_device: config.firefox_fake_device,
            desktopSharingExtensionExternalInstallation:
            options.desktopSharingExtensionExternalInstallation
        }, checkForPermissionPrompt).then( (tracks) => {
            tracks.forEach((track) => {
                track.on(TrackEvents.NO_DATA_FROM_SOURCE,
                    APP.UI.showTrackNotWorkingDialog.bind(null, track));
            });
            return tracks;
        }).catch(function (err) {
            logger.error(
                'failed to create local tracks', options.devices, err);
            return Promise.reject(err);
        });
}

/**
 * Changes the email for the local user
 * @param email {string} the new email
 */
function changeLocalEmail(email = '') {
    email = email.trim();

    if (email === APP.settings.getEmail()) {
        return;
    }

    APP.settings.setEmail(email);
    APP.UI.setUserEmail(room.myUserId(), email);
    sendData(commands.EMAIL, email);
}

/**
 * Changes the display name for the local user.
 *
 * @param {string} nickname - The new display name
 */
function changeLocalDisplayName(nickname = '') {
    const formattedNickname
        = nickname.trim().substr(0, MAX_DISPLAY_NAME_LENGTH);

    if (formattedNickname === APP.settings.getDisplayName()) {
        return;
    }

    APP.settings.setDisplayName(formattedNickname);
    room.setDisplayName(formattedNickname);
    APP.UI.changeDisplayName(APP.conference.getMyUserId(), formattedNickname);
}

/**
 * Disconnects the connection. Returns resolved Promise.
 * We need this in order to make the Promise.all
 * call in hangup() to resolve when all operations are finished.
 *
 * @returns {Promise}
 */
function disconnect() {
    connection.disconnect();
    APP.API.notifyConferenceLeft(APP.conference.roomName);
    return Promise.resolve();
}
