import { COLORS } from './colors';

export const CONTROL_BUTTON_STYLES = {
    base: {
        width: '34px',
        height: '34px',
        cursor: 'pointer',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        color: COLORS.text.light,
    },
    active: {
        backgroundColor: COLORS.primaryLight
    },
    inactive: {
        backgroundColor: COLORS.primary
    }
};
export const MAP_CONTROL_STYLES = {
    select: {
        padding: '0.5rem 1rem',
        backgroundColor: COLORS.primary,
        color: COLORS.text.light,
        borderRadius: '0.375rem',
        cursor: 'pointer',
        fontSize: '1rem'
    },
    selectDisabled: {
        backgroundColor: COLORS.primaryLight,
        cursor: 'not-allowed'
    },
    input: {
        padding: '0.5rem',
        border: '1px solid ' + COLORS.border,
        borderRadius: '0.375rem',
        backgroundColor: 'white',
        color: COLORS.text.primary,
        fontSize: '1rem'
    },
    button: {
        padding: '0.5rem 1rem',
        backgroundColor: COLORS.primary,
        color: COLORS.text.light,
        borderRadius: '0.375rem',
        cursor: 'pointer',
        whiteSpace: 'nowrap'
    }
};