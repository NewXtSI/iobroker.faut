/** Minimal type declarations for suncalc2. */
declare module 'suncalc2' {
    interface SunTimes {
        sunrise:       Date;
        sunriseEnd:    Date;
        goldenHourEnd: Date;
        solarNoon:     Date;
        goldenHour:    Date;
        sunsetStart:   Date;
        sunset:        Date;
        dusk:          Date;
        nauticalDusk:  Date;
        night:         Date;
        nadir:         Date;
        nightEnd:      Date;
        nauticalDawn:  Date;
        dawn:          Date;
    }

    interface SunPosition {
        /** Altitude above the horizon in radians. */
        altitude: number;
        /** Azimuth in radians, measured from south (positive = west). */
        azimuth:  number;
    }

    function getTimes(date: Date, lat: number, lng: number): SunTimes;
    function getPosition(date: Date, lat: number, lng: number): SunPosition;

    export { getTimes, getPosition };
}
