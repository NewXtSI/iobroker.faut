// ---- Node types ----

export type FautNodeType =
    // Root-level categories
    | 'Garten'
    | 'Gebäude'
    | 'Heizung'
    | 'Energie'
    | 'Umwelt'
    | 'Person'
    // Structural
    | 'Etage'
    | 'Raum'
    // Sensors
    | 'Temperatur'
    | 'Helligkeit'
    | 'Regen'
    | 'Bewegung'
    | 'Fenster/Tür'
    | 'Sonne'
    // Actors
    | 'Thermostat'
    | 'Rolladen'
    | 'Ventilator'
    | 'Lampe'
    | 'Alexa';

export type NodeKind = 'location' | 'sensor' | 'actor';

export interface NodeTypeDef {
    /** Shown in the type selector */
    label: string;
    kind: NodeKind;
}

export const NODE_TYPE_DEFS: Record<FautNodeType, NodeTypeDef> = {
    // Root categories
    Garten:          { label: 'Garten',              kind: 'location' },
    Gebäude:         { label: 'Gebäude',             kind: 'location' },
    Heizung:         { label: 'Heizung',             kind: 'location' },
    Energie:         { label: 'Energie',             kind: 'location' },
    Umwelt:          { label: 'Umwelt',              kind: 'location' },
    Person:          { label: 'Person',              kind: 'location' },
    // Structural
    Etage:           { label: 'Etage',               kind: 'location' },
    Raum:            { label: 'Raum',                kind: 'location' },
    // Sensors
    Temperatur:      { label: 'Temperatur (Sensor)', kind: 'sensor' },
    Helligkeit:      { label: 'Helligkeit (Sensor)', kind: 'sensor' },
    Regen:           { label: 'Regen (Sensor)',      kind: 'sensor' },
    Bewegung:        { label: 'Bewegung (Sensor)',   kind: 'sensor' },
    'Fenster/Tür':   { label: 'Fenster/Tür (Sensor)', kind: 'sensor' },
    Sonne:           { label: 'Sonne (Sensor)',       kind: 'sensor' },
    // Actors
    Thermostat:      { label: 'Thermostat (Aktor)',  kind: 'actor' },
    Rolladen:        { label: 'Rolladen (Aktor)',    kind: 'actor' },
    Ventilator:      { label: 'Ventilator (Aktor)',  kind: 'actor' },
    Lampe:           { label: 'Lampe (Aktor)',       kind: 'actor' },
    Alexa:           { label: 'Alexa (Aktor)',       kind: 'actor' },
};

/** Which types may be created as direct children of each parent type (or root) */
export const ALLOWED_CHILDREN: Record<'root' | FautNodeType, FautNodeType[]> = {
    root:           ['Garten', 'Gebäude', 'Heizung', 'Energie', 'Umwelt', 'Person', 'Sonne'],
    Garten:         ['Sonne'],
    Gebäude:        ['Etage', 'Raum'],
    Heizung:        [],
    Energie:        [],
    Umwelt:         ['Temperatur', 'Helligkeit', 'Regen', 'Sonne'],
    Person:         [],
    Etage:          ['Raum', 'Sonne', 'Alexa'],
    Raum:           ['Temperatur', 'Helligkeit', 'Bewegung', 'Fenster/Tür', 'Thermostat', 'Rolladen', 'Ventilator', 'Lampe', 'Sonne', 'Alexa'],
    Temperatur:     [],
    Helligkeit:     [],
    Regen:          [],
    Bewegung:       [],
    'Fenster/Tür':  [],
    Sonne:          [],
    Thermostat:     [],
    Rolladen:       [],
    Ventilator:     [],
    Lampe:          [],
    Alexa:          [],
};

// ---- Node config ----

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
}

// ---- Tree node ----

export interface FautTreeNode {
    id: string;
    type: FautNodeType;
    /** User-given name; defaults to the type's label */
    label: string;
    config?: FautNodeConfig;
    children?: FautTreeNode[];
}
