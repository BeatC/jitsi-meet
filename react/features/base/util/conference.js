/* global $, APP, JitsiMeetJS, config, interfaceConfig */
const logger = require("jitsi-meet-logger").getLogger(__filename);

import { openConnection } from '../../../../connection';
import Invite from '../../../../modules/UI/invite/Invite';
import ContactList from '../../../../modules/UI/side_pannels/contactlist/ContactList';

import Recorder from '../../../../modules/recorder/Recorder';

import mediaDeviceHelper from '../../../../modules/devices/mediaDeviceHelper';

import { reportError } from '../../../../modules/util/helpers';

import UIUtil from '../../../../modules/UI/util/UIUtil';
import { ConferenceConnector } from './react/features/base/util';

import analytics from '../../../../modules/analytics/analytics';

const ConnectionEvents = JitsiMeetJS.events.connection;
const ConnectionErrors = JitsiMeetJS.errors.connection;

const TrackEvents = JitsiMeetJS.events.track;
const TrackErrors = JitsiMeetJS.errors.track;

const ConnectionQualityEvents = JitsiMeetJS.events.connectionQuality;

let room, connection, localAudio, localVideo;

/**
 * Indicates whether extension external installation is in progress or not.
 */
let DSExternalInstallationInProgress = false;

export default {
    isModerator: false,
    audioMuted: false,
    videoMuted: false,
    isSharingScreen: false,
    isDesktopSharingEnabled: false,
    /*
     * Whether the local "raisedHand" flag is on.
     */
    isHandRaised: false,
    /*
     * Whether the local participant is the dominant speaker in the conference.
     */
    isDominantSpeaker: false,
    /**
     * Open new connection and join to the conference.
     * @param {object} options
     * @param {string} roomName name of the conference
     * @returns {Promise}
     */
    init(options) {
        this.roomName = options.roomName;

        // attaches global error handler, if there is already one, respect it
        if (JitsiMeetJS.getGlobalOnErrorHandler) {
            this.setGlobalErrorHandler();
        }

        const jitsiMeetJSConfig = Object.assign({
            enableAnalyticsLogging: analytics.isEnabled()
        }, config);

        return JitsiMeetJS.init(jitsiMeetJSConfig)
            .then(() => {
                analytics.init();
                return createInitialLocalTracksAndConnect(options.roomName);
            })
            .then((...args) => this.setupConference(...args));
    },

    setGlobalErrorHandler() {
        const oldOnErrorHandler = window.onerror;
        const newOnErrorHandler = (message, source, lineno, colno, error) => {
            JitsiMeetJS.getGlobalOnErrorHandler(
                message, source, lineno, colno, error);

            if(oldOnErrorHandler) {
                oldOnErrorHandler(message, source, lineno, colno, error);
            }
        };

        window.onerror = newOnErrorHandler;

        const oldOnUnhandledRejection = window.onunhandledrejection;
        const newOnUnhandledRejection = (event) => {
            JitsiMeetJS.getGlobalOnErrorHandler(
                null, null, null, null, event.reason);

            if(oldOnUnhandledRejection)
                oldOnUnhandledRejection(event);
        };

        window.onunhandledrejection = newOnUnhandledRejection;
    },

    setupConference([tracks, con]) {
        logger.log('initialized with %s local tracks', tracks.length);
        APP.connection = connection = con;
        this._bindConnectionFailedHandler(con);
        this._createRoom(tracks);
        this.isDesktopSharingEnabled =
            JitsiMeetJS.isDesktopSharingEnabled();

        if (UIUtil.isButtonEnabled('contacts'))
            APP.UI.ContactList = new ContactList(room);

        // if user didn't give access to mic or camera or doesn't have
        // them at all, we disable corresponding toolbar buttons
        if (!tracks.find((t) => t.isAudioTrack())) {
            APP.UI.setMicrophoneButtonEnabled(false);
        }

        if (!tracks.find((t) => t.isVideoTrack())) {
            APP.UI.setCameraButtonEnabled(false);
        }

        this._initDeviceList();

        if (config.iAmRecorder)
            this.recorder = new Recorder();

        // XXX The API will take care of disconnecting from the XMPP
        // server (and, thus, leaving the room) on unload.
        return new Promise((resolve, reject) => {
            const conferenceConnector = new ConferenceConnector({
                resolve,
                reject,
                room,
                connection,
                invite: this.invite
            });
            conferenceConnector.connect();
        });
    },

    /**
     * Check if id is id of the local user.
     * @param {string} id id to check
     * @returns {boolean}
     */
    isLocalId (id) {
        return this.getMyUserId() === id;
    },
    /**
     * Binds a handler that will handle the case when the connection is dropped
     * in the middle of the conference.
     * @param {JitsiConnection} connection the connection to which the handler
     * will be bound to.
     * @private
     */
    _bindConnectionFailedHandler (connection) {
        const handler = function (error, errMsg) {
            /* eslint-disable no-case-declarations */
            switch (error) {
                case ConnectionErrors.CONNECTION_DROPPED_ERROR:
                case ConnectionErrors.OTHER_ERROR:
                case ConnectionErrors.SERVER_ERROR:

                    logger.error("XMPP connection error: " + errMsg);

                    // From all of the cases above only CONNECTION_DROPPED_ERROR
                    // is considered a network type of failure
                    const isNetworkFailure
                        = error === ConnectionErrors.CONNECTION_DROPPED_ERROR;

                    APP.UI.showPageReloadOverlay(
                        isNetworkFailure,
                        "xmpp-conn-dropped:" + errMsg);

                    connection.removeEventListener(
                        ConnectionEvents.CONNECTION_FAILED, handler);

                    // FIXME it feels like the conference should be stopped
                    // by lib-jitsi-meet
                    if (room)
                        room.leave();

                    break;
            }
            /* eslint-enable no-case-declarations */
        };
        connection.addEventListener(
            ConnectionEvents.CONNECTION_FAILED, handler);
    },
    /**
     * Simulates toolbar button click for audio mute. Used by shortcuts and API.
     * @param mute true for mute and false for unmute.
     */
    muteAudio (mute) {
        muteLocalAudio(mute);
    },
    /**
     * Returns whether local audio is muted or not.
     * @returns {boolean}
     */
    isLocalAudioMuted() {
        return this.audioMuted;
    },
    /**
     * Simulates toolbar button click for audio mute. Used by shortcuts and API.
     */
    toggleAudioMuted () {
        this.muteAudio(!this.audioMuted);
    },
    /**
     * Simulates toolbar button click for video mute. Used by shortcuts and API.
     * @param mute true for mute and false for unmute.
     */
    muteVideo (mute) {
        muteLocalVideo(mute);
    },
    /**
     * Simulates toolbar button click for video mute. Used by shortcuts and API.
     */
    toggleVideoMuted () {
        this.muteVideo(!this.videoMuted);
    },
    /**
     * Retrieve list of conference participants (without local user).
     * @returns {JitsiParticipant[]}
     */
    listMembers () {
        return room.getParticipants();
    },
    /**
     * Retrieve list of ids of conference participants (without local user).
     * @returns {string[]}
     */
    listMembersIds () {
        return room.getParticipants().map(p => p.getId());
    },
    /**
     * Checks whether the participant identified by id is a moderator.
     * @id id to search for participant
     * @return {boolean} whether the participant is moderator
     */
    isParticipantModerator (id) {
        let user = room.getParticipantById(id);
        return user && user.isModerator();
    },
    /**
     * Check if SIP is supported.
     * @returns {boolean}
     */
    sipGatewayEnabled () {
        return room.isSIPCallingSupported();
    },
    get membersCount () {
        return room.getParticipants().length + 1;
    },
    /**
     * Returns true if the callstats integration is enabled, otherwise returns
     * false.
     *
     * @returns true if the callstats integration is enabled, otherwise returns
     * false.
     */
    isCallstatsEnabled () {
        return room.isCallstatsEnabled();
    },
    /**
     * Sends the given feedback through CallStats if enabled.
     *
     * @param overallFeedback an integer between 1 and 5 indicating the
     * user feedback
     * @param detailedFeedback detailed feedback from the user. Not yet used
     */
    sendFeedback (overallFeedback, detailedFeedback) {
        return room.sendFeedback (overallFeedback, detailedFeedback);
    },
    /**
     * Returns the connection times stored in the library.
     */
    getConnectionTimes () {
        return this._room.getConnectionTimes();
    },
    // used by torture currently
    isJoined () {
        return this._room
            && this._room.isJoined();
    },
    getConnectionState () {
        return this._room
            && this._room.getConnectionState();
    },
    /**
     * Checks whether or not our connection is currently in interrupted and
     * reconnect attempts are in progress.
     *
     * @returns {boolean} true if the connection is in interrupted state or
     * false otherwise.
     */
    isConnectionInterrupted () {
        return this._room.isConnectionInterrupted();
    },
    /**
     * Finds JitsiParticipant for given id.
     *
     * @param {string} id participant's identifier(MUC nickname).
     *
     * @returns {JitsiParticipant|null} participant instance for given id or
     * null if not found.
     */
    getParticipantById (id) {
        return room ? room.getParticipantById(id) : null;
    },
    /**
     * Checks whether the user identified by given id is currently connected.
     *
     * @param {string} id participant's identifier(MUC nickname)
     *
     * @returns {boolean|null} true if participant's connection is ok or false
     * if the user is having connectivity issues.
     */
    isParticipantConnectionActive (id) {
        let participant = this.getParticipantById(id);
        return participant ? participant.isConnectionActive() : null;
    },
    /**
     * Gets the display name foe the <tt>JitsiParticipant</tt> identified by
     * the given <tt>id</tt>.
     *
     * @param id {string} the participant's id(MUC nickname/JVB endpoint id)
     *
     * @return {string} the participant's display name or the default string if
     * absent.
     */
    getParticipantDisplayName (id) {
        let displayName = getDisplayName(id);
        if (displayName) {
            return displayName;
        } else {
            if (APP.conference.isLocalId(id)) {
                return APP.translation.generateTranslationHTML(
                    interfaceConfig.DEFAULT_LOCAL_DISPLAY_NAME);
            } else {
                return interfaceConfig.DEFAULT_REMOTE_DISPLAY_NAME;
            }
        }
    },
    getMyUserId () {
        return this._room
            && this._room.myUserId();
    },
    /**
     * Indicates if recording is supported in this conference.
     */
    isRecordingSupported() {
        return this._room && this._room.isRecordingSupported();
    },
    /**
     * Returns the recording state or undefined if the room is not defined.
     */
    getRecordingState() {
        return (this._room) ? this._room.getRecordingState() : undefined;
    },
    /**
     * Will be filled with values only when config.debug is enabled.
     * Its used by torture to check audio levels.
     */
    audioLevelsMap: {},
    /**
     * Returns the stored audio level (stored only if config.debug is enabled)
     * @param id the id for the user audio level to return (the id value is
     *          returned for the participant using getMyUserId() method)
     */
    getPeerSSRCAudioLevel (id) {
        return this.audioLevelsMap[id];
    },
    /**
     * @return {number} the number of participants in the conference with at
     * least one track.
     */
    getNumberOfParticipantsWithTracks() {
        return this._room.getParticipants()
            .filter((p) => p.getTracks().length > 0)
            .length;
    },
    /**
     * Returns the stats.
     */
    getStats() {
        return room.connectionQuality.getStats();
    },
    // end used by torture

    getLogs () {
        return room.getLogs();
    },

    /**
     * Download logs, a function that can be called from console while
     * debugging.
     * @param filename (optional) specify target filename
     */
    saveLogs (filename = 'meetlog.json') {
        // this can be called from console and will not have reference to this
        // that's why we reference the global var
        let logs = APP.conference.getLogs();
        let data = encodeURIComponent(JSON.stringify(logs, null, '  '));

        let elem = document.createElement('a');

        elem.download = filename;
        elem.href = 'data:application/json;charset=utf-8,\n' + data;
        elem.dataset.downloadurl
            = ['text/json', elem.download, elem.href].join(':');
        elem.dispatchEvent(new MouseEvent('click', {
            view: window,
            bubbles: true,
            cancelable: false
        }));
    },

    /**
     * Exposes a Command(s) API on this instance. It is necessitated by (1) the
     * desire to keep room private to this instance and (2) the need of other
     * modules to send and receive commands to and from participants.
     * Eventually, this instance remains in control with respect to the
     * decision whether the Command(s) API of room (i.e. lib-jitsi-meet's
     * JitsiConference) is to be used in the implementation of the Command(s)
     * API of this instance.
     */
    commands: {
        /**
         * Known custom conference commands.
         */
        defaults: commands,
        /**
         * Receives notifications from other participants about commands aka
         * custom events (sent by sendCommand or sendCommandOnce methods).
         * @param command {String} the name of the command
         * @param handler {Function} handler for the command
         */
        addCommandListener () {
            room.addCommandListener.apply(room, arguments);
        },
        /**
         * Removes command.
         * @param name {String} the name of the command.
         */
        removeCommand () {
            room.removeCommand.apply(room, arguments);
        },
        /**
         * Sends command.
         * @param name {String} the name of the command.
         * @param values {Object} with keys and values that will be sent.
         */
        sendCommand () {
            room.sendCommand.apply(room, arguments);
        },
        /**
         * Sends command one time.
         * @param name {String} the name of the command.
         * @param values {Object} with keys and values that will be sent.
         */
        sendCommandOnce () {
            room.sendCommandOnce.apply(room, arguments);
        }
    },

    _createRoom (localTracks) {
        room = connection.initJitsiConference(APP.conference.roomName,
            this._getConferenceOptions());
        this._setLocalAudioVideoStreams(localTracks);
        this.invite = new Invite(room);
        this._room = room; // FIXME do not use this

        let email = APP.settings.getEmail();
        email && sendData(this.commands.defaults.EMAIL, email);

        let avatarUrl = APP.settings.getAvatarUrl();
        avatarUrl && sendData(this.commands.defaults.AVATAR_URL,
            avatarUrl);
        !email && sendData(
             this.commands.defaults.AVATAR_ID, APP.settings.getAvatarId());

        let nick = APP.settings.getDisplayName();
        if (config.useNicks && !nick) {
            nick = APP.UI.askForNickname();
            APP.settings.setDisplayName(nick);
        }
        nick && room.setDisplayName(nick);

        this._setupListeners();
    },

    /**
     * Sets local video and audio streams.
     * @param {JitsiLocalTrack[]} tracks=[]
     * @returns {Promise[]}
     * @private
     */
    _setLocalAudioVideoStreams(tracks = []) {
        return tracks.map(track => {
            if (track.isAudioTrack()) {
                return this.useAudioStream(track);
            } else if (track.isVideoTrack()) {
                return this.useVideoStream(track);
            } else {
                logger.error(
                    "Ignored not an audio nor a video track: ", track);
                return Promise.resolve();
            }
        });
    },

    _getConferenceOptions() {
        let options = config;
        if(config.enableRecording && !config.recordingType) {
            options.recordingType = (config.hosts &&
                (typeof config.hosts.jirecon != "undefined"))?
                "jirecon" : "colibri";
        }
        return options;
    },

    /**
     * Start using provided video stream.
     * Stops previous video stream.
     * @param {JitsiLocalTrack} [stream] new stream to use or null
     * @returns {Promise}
     */
    useVideoStream (stream) {
        let promise = Promise.resolve();
        if (localVideo) {
            // this calls room.removeTrack internally
            // so we don't need to remove it manually
            promise = localVideo.dispose();
        }
        localVideo = stream;

        return promise.then(function () {
            if (stream) {
                return room.addTrack(stream);
            }
        }).then(() => {
            if (stream) {
                this.videoMuted = stream.isMuted();
                this.isSharingScreen = stream.videoType === 'desktop';

                APP.UI.addLocalStream(stream);

                stream.videoType === 'camera'
                    && APP.UI.setCameraButtonEnabled(true);
            } else {
                this.videoMuted = false;
                this.isSharingScreen = false;
            }

            APP.UI.setVideoMuted(this.getMyUserId(), this.videoMuted);

            APP.UI.updateDesktopSharingButtons();
        });
    },

    /**
     * Start using provided audio stream.
     * Stops previous audio stream.
     * @param {JitsiLocalTrack} [stream] new stream to use or null
     * @returns {Promise}
     */
    useAudioStream (stream) {
        let promise = Promise.resolve();
        if (localAudio) {
            // this calls room.removeTrack internally
            // so we don't need to remove it manually
            promise = localAudio.dispose();
        }
        localAudio = stream;

        return promise.then(function () {
            if (stream) {
                return room.addTrack(stream);
            }
        }).then(() => {
            if (stream) {
                this.audioMuted = stream.isMuted();

                APP.UI.addLocalStream(stream);
            } else {
                this.audioMuted = false;
            }

            APP.UI.setMicrophoneButtonEnabled(true);
            APP.UI.setAudioMuted(this.getMyUserId(), this.audioMuted);
        });
    },

    videoSwitchInProgress: false,
    toggleScreenSharing (shareScreen = !this.isSharingScreen) {
        if (this.videoSwitchInProgress) {
            logger.warn("Switch in progress.");
            return;
        }
        if (!this.isDesktopSharingEnabled) {
            logger.warn("Cannot toggle screen sharing: not supported.");
            return;
        }

        this.videoSwitchInProgress = true;
        let externalInstallation = false;

        if (shareScreen) {
            createLocalTracks({
                devices: ['desktop'],
                desktopSharingExtensionExternalInstallation: {
                    interval: 500,
                    checkAgain: () => {
                        return DSExternalInstallationInProgress;
                    },
                    listener: (status, url) => {
                        switch(status) {
                            case "waitingForExtension":
                                DSExternalInstallationInProgress = true;
                                externalInstallation = true;
                                APP.UI.showExtensionExternalInstallationDialog(
                                    url);
                                break;
                            case "extensionFound":
                                if(externalInstallation) //close the dialog
                                    $.prompt.close();
                                break;
                            default:
                                //Unknown status
                        }
                    }
                }
            }).then(([stream]) => {
                DSExternalInstallationInProgress = false;
                // close external installation dialog on success.
                if(externalInstallation)
                    $.prompt.close();
                stream.on(
                    TrackEvents.LOCAL_TRACK_STOPPED,
                    () => {
                        // if stream was stopped during screensharing session
                        // then we should switch to video
                        // otherwise we stopped it because we already switched
                        // to video, so nothing to do here
                        if (this.isSharingScreen) {
                            this.toggleScreenSharing(false);
                        }
                    }
                );
                return this.useVideoStream(stream);
            }).then(() => {
                this.videoSwitchInProgress = false;
                JitsiMeetJS.analytics.sendEvent(
                    'conference.sharingDesktop.start');
                logger.log('sharing local desktop');
            }).catch((err) => {
                // close external installation dialog to show the error.
                if(externalInstallation)
                    $.prompt.close();
                this.videoSwitchInProgress = false;
                this.toggleScreenSharing(false);

                if (err.name === TrackErrors.CHROME_EXTENSION_USER_CANCELED) {
                    return;
                }

                logger.error('failed to share local desktop', err);

                if (err.name === TrackErrors.FIREFOX_EXTENSION_NEEDED) {
                    APP.UI.showExtensionRequiredDialog(
                        config.desktopSharingFirefoxExtensionURL
                    );
                    return;
                }

                // Handling:
                // TrackErrors.PERMISSION_DENIED
                // TrackErrors.CHROME_EXTENSION_INSTALLATION_ERROR
                // TrackErrors.GENERAL
                // and any other
                let dialogTxt;
                let dialogTitleKey;

                if (err.name === TrackErrors.PERMISSION_DENIED) {
                    dialogTxt = APP.translation.generateTranslationHTML(
                        "dialog.screenSharingPermissionDeniedError");
                    dialogTitleKey = "dialog.error";
                } else {
                    dialogTxt = APP.translation.generateTranslationHTML(
                        "dialog.failtoinstall");
                    dialogTitleKey = "dialog.permissionDenied";
                }

                APP.UI.messageHandler.openDialog(
                    dialogTitleKey, dialogTxt, false);
            });
        } else {
            createLocalTracks({ devices: ['video'] }).then(
                ([stream]) => this.useVideoStream(stream)
            ).then(() => {
                this.videoSwitchInProgress = false;
                JitsiMeetJS.analytics.sendEvent(
                    'conference.sharingDesktop.stop');
                logger.log('sharing local video');
            }).catch((err) => {
                this.useVideoStream(null);
                this.videoSwitchInProgress = false;
                logger.error('failed to share local video', err);
            });
        }
    },
    /**
     * Setup interaction between conference and UI.
     */
    _setupListeners () {
        const uiEventsHandler = new UIEventsHandler();
        const conferenceEventsHandler = new ConferenceEventsHandler();
    },

    /**
    * Adds any room listener.
    * @param eventName one of the ConferenceEvents
    * @param callBack the function to be called when the event occurs
    */
    addConferenceListener(eventName, callBack) {
        room.on(eventName, callBack);
    },
    /**
     * Inits list of current devices and event listener for device change.
     * @private
     */
    _initDeviceList() {
        if (JitsiMeetJS.mediaDevices.isDeviceListAvailable() &&
            JitsiMeetJS.mediaDevices.isDeviceChangeAvailable()) {
            JitsiMeetJS.mediaDevices.enumerateDevices(devices => {
                // Ugly way to synchronize real device IDs with local
                // storage and settings menu. This is a workaround until
                // getConstraints() method will be implemented in browsers.
                if (localAudio) {
                    APP.settings.setMicDeviceId(
                        localAudio.getDeviceId(), false);
                }

                if (localVideo) {
                    APP.settings.setCameraDeviceId(
                        localVideo.getDeviceId(), false);
                }

                mediaDeviceHelper.setCurrentMediaDevices(devices);

                APP.UI.onAvailableDevicesChanged(devices);
            });

            this.deviceChangeListener = (devices) =>
                window.setTimeout(
                    () => this._onDeviceListChanged(devices), 0);
            JitsiMeetJS.mediaDevices.addEventListener(
                JitsiMeetJS.events.mediaDevices.DEVICE_LIST_CHANGED,
                this.deviceChangeListener);
        }
    },
    /**
     * Event listener for JitsiMediaDevicesEvents.DEVICE_LIST_CHANGED to
     * handle change of available media devices.
     * @private
     * @param {MediaDeviceInfo[]} devices
     * @returns {Promise}
     */
    _onDeviceListChanged(devices) {
        let currentDevices = mediaDeviceHelper.getCurrentMediaDevices();

        // Event handler can be fired before direct
        // enumerateDevices() call, so handle this situation here.
        if (!currentDevices.audioinput &&
            !currentDevices.videoinput &&
            !currentDevices.audiooutput) {
            mediaDeviceHelper.setCurrentMediaDevices(devices);
            currentDevices = mediaDeviceHelper.getCurrentMediaDevices();
        }

        let newDevices =
            mediaDeviceHelper.getNewMediaDevicesAfterDeviceListChanged(
                devices, this.isSharingScreen, localVideo, localAudio);
        let promises = [];
        let audioWasMuted = this.audioMuted;
        let videoWasMuted = this.videoMuted;
        let availableAudioInputDevices =
            mediaDeviceHelper.getDevicesFromListByKind(devices, 'audioinput');
        let availableVideoInputDevices =
            mediaDeviceHelper.getDevicesFromListByKind(devices, 'videoinput');

        if (typeof newDevices.audiooutput !== 'undefined') {
            // Just ignore any errors in catch block.
            promises.push(APP.settings
                .setAudioOutputDeviceId(newDevices.audiooutput)
                .catch());
        }

        promises.push(
            mediaDeviceHelper.createLocalTracksAfterDeviceListChanged(
                    createLocalTracks,
                    newDevices.videoinput,
                    newDevices.audioinput)
                .then(tracks =>
                    Promise.all(this._setLocalAudioVideoStreams(tracks)))
                .then(() => {
                    // If audio was muted before, or we unplugged current device
                    // and selected new one, then mute new audio track.
                    if (audioWasMuted ||
                        currentDevices.audioinput.length >
                        availableAudioInputDevices.length) {
                        muteLocalAudio(true);
                    }

                    // If video was muted before, or we unplugged current device
                    // and selected new one, then mute new video track.
                    if (videoWasMuted ||
                        currentDevices.videoinput.length >
                        availableVideoInputDevices.length) {
                        muteLocalVideo(true);
                    }
                }));

        return Promise.all(promises)
            .then(() => {
                mediaDeviceHelper.setCurrentMediaDevices(devices);
                APP.UI.onAvailableDevicesChanged(devices);
            });
    },

    /**
     * Toggles the local "raised hand" status.
     */
    maybeToggleRaisedHand() {
        this.setRaisedHand(!this.isHandRaised);
    },

    /**
     * Sets the local "raised hand" status to a particular value.
     */
    setRaisedHand(raisedHand) {
        if (raisedHand !== this.isHandRaised)
        {
            APP.UI.onLocalRaiseHandChanged(raisedHand);

            this.isHandRaised = raisedHand;
            // Advertise the updated status
            room.setLocalParticipantProperty("raisedHand", raisedHand);
            // Update the view
            APP.UI.setLocalRaisedHandStatus(raisedHand);
        }
    },
    /**
     * Log event to callstats and analytics.
     * @param {string} name the event name
     * @param {int} value the value (it's int because google analytics supports
     * only int).
     * @param {string} label short text which provides more info about the event
     * which allows to distinguish between few event cases of the same name
     * NOTE: Should be used after conference.init
     */
    logEvent(name, value, label) {
        if(JitsiMeetJS.analytics) {
            JitsiMeetJS.analytics.sendEvent(name, {value, label});
        }
        if(room) {
            room.sendApplicationLog(JSON.stringify({name, value, label}));
        }
    },
    /**
     * Methods logs an application event given in the JSON format.
     * @param {string} logJSON an event to be logged in JSON format
     */
    logJSON(logJSON) {
        if (room) {
            room.sendApplicationLog(logJSON);
        }
    },
    /**
     * Disconnect from the conference and optionally request user feedback.
     * @param {boolean} [requestFeedback=false] if user feedback should be
     * requested
     */
    hangup (requestFeedback = false) {
        APP.UI.hideRingOverLay();
        let requestFeedbackPromise = requestFeedback
                ? APP.UI.requestFeedbackOnHangup()
                // false - because the thank you dialog shouldn't be displayed
                    .catch(() => Promise.resolve(false))
                : Promise.resolve(true);// true - because the thank you dialog
                //should be displayed
        // All promises are returning Promise.resolve to make Promise.all to
        // be resolved when both Promises are finished. Otherwise Promise.all
        // will reject on first rejected Promise and we can redirect the page
        // before all operations are done.
        Promise.all([
            requestFeedbackPromise,
            room.leave().then(disconnect, disconnect)
        ]).then(values => {
            APP.API.notifyReadyToClose();
            maybeRedirectToWelcomePage(values[0]);
        });
    }
};
