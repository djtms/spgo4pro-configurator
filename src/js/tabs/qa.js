'use strict';

var
    sdcardTimer;

TABS.qa = {
    transponder: {
        available: false
    }
};

TABS.qa.initialize = function (callback) {
    var self = this;

    if (GUI.active_tab != 'qa') {
        GUI.active_tab = 'qa';
    }

    function initSensorData(){
        for (var i = 0; i < 3; i++) {
            SENSOR_DATA.accelerometer[i] = 0;
            SENSOR_DATA.gyroscope[i] = 0;
            SENSOR_DATA.magnetometer[i] = 0;
            SENSOR_DATA.sonar = 0;
            SENSOR_DATA.altitude = 0;
            SENSOR_DATA.debug[i] = 0;
        }
    }

    function initDataArray(length) {
        var data = new Array(length);
        for (var i = 0; i < length; i++) {
            data[i] = new Array();
            data[i].min = -1;
            data[i].max = 1;
        }
        return data;
    }

    function addSampleToData(data, sampleNumber, sensorData) {
        for (var i = 0; i < data.length; i++) {
            var dataPoint = sensorData[i];
            data[i].push([sampleNumber, dataPoint]);
            if (dataPoint < data[i].min) {
                data[i].min = dataPoint;
            }
            if (dataPoint > data[i].max) {
                data[i].max = dataPoint;
            }
        }
        while (data[0].length > 300) {
            for (i = 0; i < data.length; i++) {
                data[i].shift();
            }
        }
        return sampleNumber + 1;
    }

    var margin = {top: 20, right: 10, bottom: 10, left: 40};
    function updateGraphHelperSize(helpers) {
        helpers.width = helpers.targetElement.width() - margin.left - margin.right;
        helpers.height = helpers.targetElement.height() - margin.top - margin.bottom;

        helpers.widthScale.range([0, helpers.width]);
        helpers.heightScale.range([helpers.height, 0]);

        helpers.xGrid.tickSize(-helpers.height, 0, 0);
        helpers.yGrid.tickSize(-helpers.width, 0, 0);
    }

    function initGraphHelpers(selector, sampleNumber, heightDomain) {
        var helpers = {selector: selector, targetElement: $(selector), dynamicHeightDomain: !heightDomain};

        helpers.widthScale = d3.scale.linear()
            .clamp(true)
            .domain([(sampleNumber - 299), sampleNumber]);

        helpers.heightScale = d3.scale.linear()
            .clamp(true)
            .domain(heightDomain || [1, -1]);

        helpers.xGrid = d3.svg.axis();
        helpers.yGrid = d3.svg.axis();

        updateGraphHelperSize(helpers);

        helpers.xGrid
            .scale(helpers.widthScale)
            .orient("bottom")
            .ticks(5)
            .tickFormat("");

        helpers.yGrid
            .scale(helpers.heightScale)
            .orient("left")
            .ticks(5)
            .tickFormat("");

        helpers.xAxis = d3.svg.axis()
            .scale(helpers.widthScale)
            .ticks(5)
            .orient("bottom")
            .tickFormat(function (d) {return d;});

        helpers.yAxis = d3.svg.axis()
            .scale(helpers.heightScale)
            .ticks(5)
            .orient("left")
            .tickFormat(function (d) {return d;});

        helpers.line = d3.svg.line()
            .x(function (d) {return helpers.widthScale(d[0]);})
            .y(function (d) {return helpers.heightScale(d[1]);});

        return helpers;
    }

    function drawGraph(graphHelpers, data, sampleNumber) {
        var svg = d3.select(graphHelpers.selector);

        if (graphHelpers.dynamicHeightDomain) {
            var limits = [];
            $.each(data, function (idx, datum) {
                limits.push(datum.min);
                limits.push(datum.max);
            });
            graphHelpers.heightScale.domain(d3.extent(limits));
        }
        graphHelpers.widthScale.domain([(sampleNumber - 299), sampleNumber]);

        svg.select(".x.grid").call(graphHelpers.xGrid);
        svg.select(".y.grid").call(graphHelpers.yGrid);
        svg.select(".x.axis").call(graphHelpers.xAxis);
        svg.select(".y.axis").call(graphHelpers.yAxis);

        var group = svg.select("g.data");
        var lines = group.selectAll("path").data(data, function (d, i) {return i;});
        var newLines = lines.enter().append("path").attr("class", "line");
        lines.attr('d', graphHelpers.line);
    }

    function plot_gyro(enable) {
        if (enable) {
            $('.wrapper.gyro').show();
        } else {
            $('.wrapper.gyro').hide();
        }
    }

    function plot_accel(enable) {
        if (enable) {
            $('.wrapper.accel').show();
        } else {
            $('.wrapper.accel').hide();
        }
    }

    function plot_mag(enable) {
        if (enable) {
            $('.wrapper.mag').show();
        } else {
            $('.wrapper.mag').hide();
        }
    }

    function plot_altitude(enable) {
        if (enable) {
            $('.wrapper.altitude').show();
        } else {
            $('.wrapper.altitude').hide();
        }
    }

    function plot_sonar(enable) {
        if (enable) {
            $('.wrapper.sonar').show();
        } else {
            $('.wrapper.sonar').hide();
        }
    }

    function plot_debug(enable) {
        if (enable) {
            $('.wrapper.debug').show();
        } else {
            $('.wrapper.debug').hide();
        }
    }

    // transponder supported added in MSP API Version 1.16.0
    if ( CONFIG ) {
        TABS.qa.transponder.available = semver.gte(CONFIG.apiVersion, "1.16.0");
    }

    var first_init = init_transponder_config;
    
    if ( !TABS.qa.transponder.available ) {
        first_init = init_sd_summary;
    }

    function init_transponder_config() {
        var next_callback = init_sd_summary;
        MSP.send_message(MSPCodes.MSP_TRANSPONDER_CONFIG, false, false, next_callback);
    }

    function init_sd_summary() {
        var next_callback = init_sensor_alignment;
        MSP.send_message(MSPCodes.MSP_SDCARD_SUMMARY, false, false, next_callback); 
    }
    
    function init_sensor_alignment() {
        var next_callback = load_html;
        if (semver.gte(CONFIG.apiVersion, "1.15.0")) {
            MSP.send_message(MSPCodes.MSP_SENSOR_ALIGNMENT, false, false, next_callback);
        } else {
            next_callback();
        }
    }

    
    function load_html() {
        $('#content').load("./tabs/qa.html", process_html);
    }

    //
    // SD card
    //
    
    function formatFilesizeKilobytes(kilobytes) {
        if (kilobytes < 1024) {
            return Math.round(kilobytes) + "kB";
        }

        var
            megabytes = kilobytes / 1024,
            gigabytes;

        if (megabytes < 900) {
            return megabytes.toFixed(1) + "MB";
        } else {
            gigabytes = megabytes / 1024;

            return gigabytes.toFixed(1) + "GB";
        }
    }

    function formatFilesizeBytes(bytes) {
        if (bytes < 1024) {
            return bytes + "B";
        }
        return formatFilesizeKilobytes(bytes / 1024);
    }

    function update_bar_width(bar, value, total, label, valuesAreKilobytes) {
        if (value > 0) {
            bar.css({
                width: (value / total * 100) + "%",
                display: 'block'
            });

            $("div", bar).text((label ? label + " " : "") + (valuesAreKilobytes ? formatFilesizeKilobytes(value) : formatFilesizeBytes(value)));
        } else {
            bar.css({
                display: 'none'
            });
        }
    }

    function update_html() {
        update_bar_width($(".tab-qa .sdcard-other"), SDCARD.totalSizeKB - SDCARD.freeSizeKB, SDCARD.totalSizeKB, i18n.getMessage('dataflashUnavSpace'), true);
        update_bar_width($(".tab-qa .sdcard-free"), SDCARD.freeSizeKB, SDCARD.totalSizeKB, i18n.getMessage('dataflashLogsSpace'), true);

        $(".tab-qa")
            .toggleClass("sdcard-error", SDCARD.state === MSP.SDCARD_STATE_FATAL)
            .toggleClass("sdcard-initializing", SDCARD.state === MSP.SDCARD_STATE_CARD_INIT || SDCARD.state === MSP.SDCARD_STATE_FS_INIT)
            .toggleClass("sdcard-ready", SDCARD.state === MSP.SDCARD_STATE_READY);
        

        var loggingStatus
        switch (SDCARD.state) {
            case MSP.SDCARD_STATE_NOT_PRESENT:
                $(".sdcard-status").text(i18n.getMessage('sdcardStatusNoCard'));
                loggingStatus = 'SdCard: NotPresent';
            break;
            case MSP.SDCARD_STATE_FATAL:
                $(".sdcard-status").html(i18n.getMessage('sdcardStatusReboot'));
                loggingStatus = 'SdCard: Error';
            break;
            case MSP.SDCARD_STATE_READY:
                $(".sdcard-status").text(i18n.getMessage('sdcardStatusReady'));
                loggingStatus = 'SdCard: Ready';
            break;
            case MSP.SDCARD_STATE_CARD_INIT:
                $(".sdcard-status").text(i18n.getMessage('sdcardStatusStarting'));
                loggingStatus = 'SdCard: Init';
            break;
            case MSP.SDCARD_STATE_FS_INIT:
                $(".sdcard-status").text(i18n.getMessage('sdcardStatusFileSystem'));
                loggingStatus = 'SdCard: FsInit';
            break;
            default:
                $(".sdcard-status").text(i18n.getMessage('sdcardStatusUnknown',[SDCARD.state]));
        }

        if (SDCARD.supported && !sdcardTimer) {
            // Poll for changes in SD card status
            sdcardTimer = setTimeout(function() {
                sdcardTimer = false;
                if (CONFIGURATOR.connectionValid) {
                    MSP.send_message(MSPCodes.MSP_SDCARD_SUMMARY, false, false, function() {
                        update_html();
                    });
                }
            }, 2000);
        }
    }

    function process_html() {
        // translate to user-selected language
        i18n.localizePage();

        // disable graphs for qa that are missing
        var checkboxes = $('.tab-qa .info .checkboxes input');
        checkboxes.parent().show();
        
        if (CONFIG.boardType == 0 || CONFIG.boardType == 2) { 
            if (!have_sensor(CONFIG.activeSensors, 'acc')) {
                checkboxes.eq(1).prop('disabled', true);
            }
            if (!have_sensor(CONFIG.activeSensors, 'mag')) {
                checkboxes.eq(2).prop('disabled', true);
            }
            if (!(have_sensor(CONFIG.activeSensors, 'baro') || (semver.gte(CONFIG.apiVersion, "1.40.0") && have_sensor(CONFIG.activeSensors, 'gps')))) {
                checkboxes.eq(3).prop('disabled', true);
            }
            if (!have_sensor(CONFIG.activeSensors, 'sonar')) {
                checkboxes.eq(4).prop('disabled', true);
            }
        } else {
            for (var i = 0; i <= 4; i++) {
                checkboxes.eq(i).prop('disabled', true);
                checkboxes.eq(i).parent().hide();
            }
        }

        $('.tab-qa .info .checkboxes input').change(function () {
            var enable = $(this).prop('checked');
            var index = $(this).parent().index();

            switch (index) {
                case 0:
                    plot_gyro(enable);
                    break;
                case 1:
                    plot_accel(enable);
                    break;
                case 2:
                    plot_mag(enable);
                    break;
                case 3:
                    plot_altitude(enable);
                    break;
                case 4:
                    plot_sonar(enable);
                    break;
                case 5:
                    plot_debug(enable);
                    break;
            }

            var checkboxes = [];
            $('.tab-qa .info .checkboxes input').each(function () {
                checkboxes.push($(this).prop('checked'));
            });

            $('.tab-qa .rate select:first').change();
        });

        let altitudeHint_e = $('.tab-qa #qaAltitudeHint');
        if (semver.lt(CONFIG.apiVersion, "1.40.0")) {
            altitudeHint_e.hide();
        }

        // Always start with default/empty sensor data array, clean slate all
        initSensorData();

        // Setup variables
        var samples_gyro_i = 0,
            samples_accel_i = 0,
            samples_mag_i = 0,
            samples_altitude_i = 0,
            samples_sonar_i = 0,
            samples_debug_i = 0,
            gyro_data = initDataArray(3),
            accel_data = initDataArray(3),
            mag_data = initDataArray(3),
            altitude_data = initDataArray(1),
            sonar_data = initDataArray(1),
            debug_data = [
            initDataArray(1),
            initDataArray(1),
            initDataArray(1),
            initDataArray(1)
        ];

        var gyroHelpers = initGraphHelpers('#gyro', samples_gyro_i, [-2000, 2000]);
        var accelHelpers = initGraphHelpers('#accel', samples_accel_i, [-2, 2]);
        var magHelpers = initGraphHelpers('#mag', samples_mag_i, [-1, 1]);
        var altitudeHelpers = initGraphHelpers('#altitude', samples_altitude_i);
        var sonarHelpers = initGraphHelpers('#sonar', samples_sonar_i);
        var debugHelpers = [
            initGraphHelpers('#debug1', samples_debug_i),
            initGraphHelpers('#debug2', samples_debug_i),
            initGraphHelpers('#debug3', samples_debug_i),
            initGraphHelpers('#debug4', samples_debug_i)
        ];

        var raw_data_text_ements = {
            x: [],
            y: [],
            z: []
        };
        $('.plot_control .x, .plot_control .y, .plot_control .z').each(function () {
            var el = $(this);
            if (el.hasClass('x')) {
                raw_data_text_ements.x.push(el);
            } else if (el.hasClass('y')) {
                raw_data_text_ements.y.push(el);
            } else {
                raw_data_text_ements.z.push(el);
            }
        });

        $('.tab-qa .rate select, .tab-qa .scale select').change(function () {
            // if any of the select fields change value, all of the select values are grabbed
            // and timers are re-initialized with the new settings
            var rates = {
                'gyro':   parseInt($('.tab-qa select[name="gyro_refresh_rate"]').val(), 10),
                'accel':  parseInt($('.tab-qa select[name="accel_refresh_rate"]').val(), 10),
                'mag':    parseInt($('.tab-qa select[name="mag_refresh_rate"]').val(), 10),
                'altitude':   parseInt($('.tab-qa select[name="altitude_refresh_rate"]').val(), 10),
                'sonar':  parseInt($('.tab-qa select[name="sonar_refresh_rate"]').val(), 10),
                'debug':  parseInt($('.tab-qa select[name="debug_refresh_rate"]').val(), 10)
            };

            var scales = {
                'gyro':  parseFloat($('.tab-qa select[name="gyro_scale"]').val()),
                'accel': parseFloat($('.tab-qa select[name="accel_scale"]').val()),
                'mag':   parseFloat($('.tab-qa select[name="mag_scale"]').val())
            };

            // handling of "data pulling" is a little bit funky here, as MSP_RAW_IMU contains values for gyro/accel/mag but not altitude
            // this means that setting a slower refresh rate on any of the attributes would have no effect
            // what we will do instead is = determinate the fastest refresh rate for those 3 attributes, use that as a "polling rate"
            // and use the "slower" refresh rates only for re-drawing the graphs (to save resources/computing power)
            var fastest = d3.min([rates.gyro, rates.accel, rates.mag]);

            // re-initialize domains with new scales
            gyroHelpers = initGraphHelpers('#gyro', samples_gyro_i, [-scales.gyro, scales.gyro]);
            accelHelpers = initGraphHelpers('#accel', samples_accel_i, [-scales.accel, scales.accel]);
            magHelpers = initGraphHelpers('#mag', samples_mag_i, [-scales.mag, scales.mag]);

            // fetch currently enabled plots
            var checkboxes = [];
            $('.tab-qa .info .checkboxes input').each(function () {
                checkboxes.push($(this).prop('checked'));
            });

            // timer initialization
            GUI.interval_kill_all(['status_pull']);

            // data pulling timers
            if (checkboxes[0] || checkboxes[1] || checkboxes[2]) {
                GUI.interval_add('IMU_pull', function imu_data_pull() {
                    MSP.send_message(MSPCodes.MSP_RAW_IMU, false, false, update_imu_graphs);
                }, fastest, true);
            }

            if (checkboxes[3]) {
                GUI.interval_add('altitude_pull', function altitude_data_pull() {
                    MSP.send_message(MSPCodes.MSP_ALTITUDE, false, false, update_altitude_graph);
                }, rates.altitude, true);
            }

            if (checkboxes[4]) {
                GUI.interval_add('sonar_pull', function sonar_data_pull() {
                    MSP.send_message(MSPCodes.MSP_SONAR, false, false, update_sonar_graphs);
                }, rates.sonar, true);
            }

            if (checkboxes[5]) {
                GUI.interval_add('debug_pull', function debug_data_pull() {
                    MSP.send_message(MSPCodes.MSP_DEBUG, false, false, update_debug_graphs);
                }, rates.debug, true);
            }

            function update_imu_graphs() {
                if (checkboxes[0]) {
                    updateGraphHelperSize(gyroHelpers);

                    samples_gyro_i = addSampleToData(gyro_data, samples_gyro_i, SENSOR_DATA.gyroscope);
                    drawGraph(gyroHelpers, gyro_data, samples_gyro_i);
                    raw_data_text_ements.x[0].text(SENSOR_DATA.gyroscope[0].toFixed(2));
                    raw_data_text_ements.y[0].text(SENSOR_DATA.gyroscope[1].toFixed(2));
                    raw_data_text_ements.z[0].text(SENSOR_DATA.gyroscope[2].toFixed(2));
                }

                if (checkboxes[1]) {
                    updateGraphHelperSize(accelHelpers);

                    samples_accel_i = addSampleToData(accel_data, samples_accel_i, SENSOR_DATA.accelerometer);
                    drawGraph(accelHelpers, accel_data, samples_accel_i);
                    raw_data_text_ements.x[1].text(SENSOR_DATA.accelerometer[0].toFixed(2));
                    raw_data_text_ements.y[1].text(SENSOR_DATA.accelerometer[1].toFixed(2));
                    raw_data_text_ements.z[1].text(SENSOR_DATA.accelerometer[2].toFixed(2));
                }

                if (checkboxes[2]) {
                    updateGraphHelperSize(magHelpers);

                    samples_mag_i = addSampleToData(mag_data, samples_mag_i, SENSOR_DATA.magnetometer);
                    drawGraph(magHelpers, mag_data, samples_mag_i);
                    raw_data_text_ements.x[2].text(SENSOR_DATA.magnetometer[0].toFixed(2));
                    raw_data_text_ements.y[2].text(SENSOR_DATA.magnetometer[1].toFixed(2));
                    raw_data_text_ements.z[2].text(SENSOR_DATA.magnetometer[2].toFixed(2));
                }
            }

            function update_altitude_graph() {
                updateGraphHelperSize(altitudeHelpers);

                samples_altitude_i = addSampleToData(altitude_data, samples_altitude_i, [SENSOR_DATA.altitude]);
                drawGraph(altitudeHelpers, altitude_data, samples_altitude_i);
                raw_data_text_ements.x[3].text(SENSOR_DATA.altitude.toFixed(2));
            }

            function update_sonar_graphs() {
                updateGraphHelperSize(sonarHelpers);

                samples_sonar_i = addSampleToData(sonar_data, samples_sonar_i, [SENSOR_DATA.sonar]);
                drawGraph(sonarHelpers, sonar_data, samples_sonar_i);
                raw_data_text_ements.x[4].text(SENSOR_DATA.sonar.toFixed(2));
            }

            function update_debug_graphs() {
                for (var i = 0; i < 4; i++) {
                    updateGraphHelperSize(debugHelpers[i]);

                    addSampleToData(debug_data[i], samples_debug_i, [SENSOR_DATA.debug[i]]);
                    drawGraph(debugHelpers[i], debug_data[i], samples_debug_i);
                    raw_data_text_ements.x[5 + i].text(SENSOR_DATA.debug[i]);
                }
                samples_debug_i++;
            }
        });

        $('.tab-qa .rate select:first').change();
        $('.tab-qa .info input:not(:disabled)').prop('checked', true).change();

        //
        // Transponder Config
        //
        
        $(".tab-qa").toggleClass("transponder-supported", TABS.qa.transponder.available && TRANSPONDER.supported);

        function hexToBytes(hex) {
            var bytes = [];
            for ( let c = 0; c < hex.length; c += 2 ) {
                bytes.push(~parseInt(hex.substr(c, 2), 16));
            }

            return bytes;
        }

        $('a.save').click(function() {
            let _this = this;

            function save_transponder_data() {
                MSP.send_message(MSPCodes.MSP_SET_TRANSPONDER_CONFIG, mspHelper.crunch(MSPCodes.MSP_SET_TRANSPONDER_CONFIG), false, save_to_eeprom);
            }

            function save_to_eeprom() {
                MSP.send_message(MSPCodes.MSP_EEPROM_WRITE, false, false, function() {
                    GUI.log(i18n.getMessage('transponderEepromSaved'));
                    if ( $(_this).hasClass('reboot') ) {
                        GUI.tab_switch_cleanup(function() {
                            MSP.send_message(MSPCodes.MSP_SET_REBOOT, false, false);
                            reinitialiseConnection(self);
                        });
                    }
                });
            }

            TRANSPONDER.data = hexToBytes("0eaddcba98d6");
            TRANSPONDER.provider = 1

            if (TRANSPONDER.provider !== "0" && TRANSPONDER.data.length !== TRANSPONDER.providers.find(function(provider) {
                    return provider.id == TRANSPONDER.provider;
                }).dataLength ) {
                GUI.log(i18n.getMessage('transponderDataInvalid'));
            } else {
                save_transponder_data();
            }
        });

        //
        // RSSI & Battery Voltage
        //
        
        // cached elements
        var bat_voltage_e = $('.bat-voltage'),
            bat_mah_drawn_e = $('.bat-mah-drawn'),
            bat_mah_drawing_e = $('.bat-mah-drawing'),
            rssi_e = $('.rssi'),
            gyro_status_e = $('.gyro-status');

        function get_analog_data() {

            MSP.send_message(MSPCodes.MSP_ANALOG, false, false, function () {
                bat_voltage_e.text(i18n.getMessage('initialSetupBatteryValue', [ANALOG.voltage]));
                bat_mah_drawn_e.text(i18n.getMessage('initialSetupBatteryMahValue', [ANALOG.mAhdrawn]));
                bat_mah_drawing_e.text(i18n.getMessage('initialSetupBatteryAValue', [ANALOG.amperage.toFixed(2)]));
                rssi_e.text(i18n.getMessage('initialSetupRSSIValue', [((ANALOG.rssi / 1023) * 100).toFixed(0)]));
            });
        }

        // status data pulled via separate timer with static speed
        GUI.interval_add('qa_status_pull', function status_pull() {
            MSP.send_message(MSPCodes.MSP_STATUS);
        }, 250, true);

        GUI.interval_add('qa_analog_data_pull', get_analog_data, 250, true); // 4 fps

        //
        // SD card
        //
        
        $(".tab-qa").toggleClass("sdcard-supported", SDCARD.supported);

        update_html();
        
        //
        // Gyro status
        //
        
        const GYRO_DETECTION_FLAGS = {
                DETECTED_GYRO_1:      (1 << 0), 
                DETECTED_GYRO_2:      (1 << 1),
                DETECTED_DUAL_GYROS:  (1 << 7)
        };

        var detected_gyro_1 = (SENSOR_ALIGNMENT.gyro_detection_flags & GYRO_DETECTION_FLAGS.DETECTED_GYRO_1) != 0;
        var detected_gyro_2 = (SENSOR_ALIGNMENT.gyro_detection_flags & GYRO_DETECTION_FLAGS.DETECTED_GYRO_2) != 0;
        var detected_dual_gyros = (SENSOR_ALIGNMENT.gyro_detection_flags & GYRO_DETECTION_FLAGS.DETECTED_DUAL_GYROS) != 0;

        if (detected_dual_gyros) {
            gyro_status_e.text(i18n.getMessage('qaGyroStatus_DualGyros'));
        } else if (detected_gyro_1) {
            gyro_status_e.text(i18n.getMessage('qaGyroStatus_FirstOnly'));
        } else if (detected_gyro_2) {
            gyro_status_e.text(i18n.getMessage('qaGyroStatus_SecondOnly'));
        }

        //
        // Reboot/Bootloader
        //
        $('a.rebootFlashBootloader').click(function () {
            var buffer = [];
            buffer.push(mspHelper.REBOOT_TYPES.FLASH_BOOTLOADER);
            MSP.send_message(MSPCodes.MSP_SET_REBOOT, buffer, false);
        });

        
        GUI.content_ready(callback);
    }

    first_init();
};

TABS.qa.cleanup = function (callback) {
    serial.emptyOutputBuffer();

    if (sdcardTimer) {
        clearTimeout(sdcardTimer);
        sdcardTimer = false;
    }

    if (callback) callback();
};
