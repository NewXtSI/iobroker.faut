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
    | 'Lampe';

export interface FautNodeConfig {
    // Temperatur-specific
    dpTemperatur?: string;
    dpLuftfeuchtigkeit?: string;
    // Helligkeit-specific
    dpLux?: string;
    globalerSensor?: boolean;
    // Bewegung-specific
    dpBewegung?: string;
    // Fenster/Tür-specific
    dpFensterTuer?: string;
    // Rolladen-specific
    dpPosition?: string;
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
    // Raum shutter control
    rolladensteuerung?: boolean;
    himmelsrichtung?: number;
    rolladenAufgangOffset?: number;
    rolladenUntergangOffset?: number;
    blendschutz?: boolean;
    hitzeschutz?: boolean;
}

export interface FautTreeNode {
    id: string;
    type: FautNodeType;
    /** User-given display name */
    label: string;
    config?: FautNodeConfig;
    children?: FautTreeNode[];
}
