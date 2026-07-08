/**
 * Shared tree type definitions for the adapter backend.
 * Mirror of src-admin/src/types/treeTypes.ts (without UI imports).
 */

export type FautNodeType =
    | 'Garten'
    | 'Gebäude'
    | 'Heizung'
    | 'Energie'
    | 'Umwelt'
    | 'Person'
    | 'Etage'
    | 'Raum'
    | 'Temperatur'
    | 'Helligkeit'
    | 'Regen'
    | 'Bewegung'
    | 'Fenster/Tür'
    | 'Sonne'
    | 'Thermostat'
    | 'Rolladen'
    | 'Ventilator'
    | 'Lampe'
    | 'Alexa'
    | 'Wechselrichter'
    | 'Batteriespeicher'
    | 'Solarpanel';

export interface FautNodeConfig {
    // Temperatur-specific
    dpTemperatur?: string;
    dpLuftfeuchtigkeit?: string;
    aussentemperatursensor?: boolean;
    // Helligkeit-specific
    dpLux?: string;
    globalerSensor?: boolean;
    // Bewegung-specific
    dpBewegung?: string;
    // Fenster/Tür-specific
    dpFensterTuer?: string;
    // Rolladen-specific
    aktiviert?: boolean;
    dpPosition?: string;
    sunblockPosition?: number;
    heatblockPosition?: number;
    // Common for all sensors/actors
    batteriebetrieben?: boolean;
    dpBatterie?: string;
    erreichbarkeit?: boolean;
    dpErreichbarkeit?: string;
    // Raum-specific
    bewegungserkennung?: boolean;
    bewegungsCooldown?: number;
    dunkelheitserkennung?: boolean;
    dunkelgrenze?: number;
    globalenSensorBenutzen?: boolean;
    lichtsteuerung?: boolean;
    // Raum shutter control
    rolladensteuerung?: boolean;
    himmelsrichtung?: number;
    rolladenAufgangOffset?: number;
    rolladenUntergangOffset?: number;
    blendschutz?: boolean;
    hitzeschutz?: boolean;
    // Person-specific
    dpResident?: string;
    // Alexa node-specific
    dpAlexa?: string;
    // Raum climate control
    klimasteuerung?: boolean;
    solltemperatur?: number;
    absenkungNacht?: number;
    absenkungAbwesend?: number;
    // Heizung node
    heizperiodeAktiv?: boolean;
    energiesparmodusAktiv?: boolean;
    dpOelstand?: string;
    dpBetriebsart?: string;
    dpStoerung?: string;
    dpFehlertext?: string;
    // Energie node
    dpStromzaehlerStand?: string;
    dpStromzaehlerEinspeisestand?: string;
    dpStromzaehlerVerbrauch?: string;
    // Wechselrichter
    dpGesamterzeugung?: string;
    dpWechselrichterPower?: string;
    // Batteriespeicher
    dpSoc?: string;
    dpBatterieKwh?: string;
    // Solarpanel
    dpSolarpanelPower?: string;
}

export interface FautTreeNode {
    id: string;
    type: FautNodeType;
    /** User-given display name */
    label: string;
    config?: FautNodeConfig;
    children?: FautTreeNode[];
}
