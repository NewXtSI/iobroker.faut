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
    // Actors
    | 'Thermostat'
    | 'Rolladen'
    | 'Ventilator'
    | 'Lampe';

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
    // Actors
    Thermostat:      { label: 'Thermostat (Aktor)',  kind: 'actor' },
    Rolladen:        { label: 'Rolladen (Aktor)',    kind: 'actor' },
    Ventilator:      { label: 'Ventilator (Aktor)',  kind: 'actor' },
    Lampe:           { label: 'Lampe (Aktor)',       kind: 'actor' },
};

/** Which types may be created as direct children of each parent type (or root) */
export const ALLOWED_CHILDREN: Record<'root' | FautNodeType, FautNodeType[]> = {
    root:           ['Garten', 'Gebäude', 'Heizung', 'Energie', 'Umwelt', 'Person'],
    Garten:         [],
    Gebäude:        ['Etage', 'Raum'],
    Heizung:        [],
    Energie:        [],
    Umwelt:         ['Temperatur', 'Helligkeit', 'Regen'],
    Person:         [],
    Etage:          ['Raum'],
    Raum:           ['Temperatur', 'Helligkeit', 'Bewegung', 'Fenster/Tür', 'Thermostat', 'Rolladen', 'Ventilator', 'Lampe'],
    Temperatur:     [],
    Helligkeit:     [],
    Regen:          [],
    Bewegung:       [],
    'Fenster/Tür':  [],
    Thermostat:     [],
    Rolladen:       [],
    Ventilator:     [],
    Lampe:          [],
};

// ---- Tree node ----

export interface FautTreeNode {
    id: string;
    type: FautNodeType;
    /** User-given name; defaults to the type's label */
    label: string;
    children?: FautTreeNode[];
}
