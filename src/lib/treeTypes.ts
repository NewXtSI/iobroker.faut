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
    | 'Thermostat'
    | 'Rolladen'
    | 'Ventilator'
    | 'Lampe';

export interface FautTreeNode {
    id: string;
    type: FautNodeType;
    /** User-given display name */
    label: string;
    children?: FautTreeNode[];
}
