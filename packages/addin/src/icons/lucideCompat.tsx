import React from 'react';

type CompatIconProps = React.SVGProps<SVGSVGElement> & {
    size?: number | string;
    color?: string;
    strokeWidth?: number | string;
    absoluteStrokeWidth?: boolean;
};

function createCompatIcon(displayName: string) {
    const Icon = React.forwardRef<SVGSVGElement, CompatIconProps>(function CompatIcon(props, ref) {
        const safeProps = props || {};
        const {
            size = 24,
            color = 'currentColor',
            strokeWidth = 2,
            absoluteStrokeWidth,
            className = '',
            children,
            ...rest
        } = safeProps;
        const resolvedStrokeWidth = absoluteStrokeWidth
            ? (24 * Number(strokeWidth)) / Number(size)
            : strokeWidth;

        return (
            <svg
                ref={ref}
                xmlns="http://www.w3.org/2000/svg"
                width={size}
                height={size}
                viewBox="0 0 24 24"
                fill="none"
                stroke={color}
                strokeWidth={resolvedStrokeWidth}
                strokeLinecap="round"
                strokeLinejoin="round"
                className={`lucide lucide-${displayName.toLowerCase()} ${className}`.trim()}
                {...rest}
            >
                <circle cx="12" cy="12" r="9" />
                <path d="M8 12h8" />
                <path d="M12 8v8" />
                {children}
            </svg>
        );
    });

    Icon.displayName = displayName;
    return Icon;
}

export const AlertCircle = createCompatIcon('AlertCircle');
export const AlertTriangle = createCompatIcon('AlertTriangle');
export const ArrowLeft = createCompatIcon('ArrowLeft');
export const BookOpen = createCompatIcon('BookOpen');
export const BookText = createCompatIcon('BookText');
export const Bot = createCompatIcon('Bot');
export const Check = createCompatIcon('Check');
export const CheckCircle = createCompatIcon('CheckCircle');
export const CheckCircle2 = createCompatIcon('CheckCircle2');
export const ChevronDown = createCompatIcon('ChevronDown');
export const ChevronRight = createCompatIcon('ChevronRight');
export const ChevronUp = createCompatIcon('ChevronUp');
export const Circle = createCompatIcon('Circle');
export const ClipboardPaste = createCompatIcon('ClipboardPaste');
export const Clock = createCompatIcon('Clock');
export const Copy = createCompatIcon('Copy');
export const CornerDownLeft = createCompatIcon('CornerDownLeft');
export const Cpu = createCompatIcon('Cpu');
export const Download = createCompatIcon('Download');
export const Edit2 = createCompatIcon('Edit2');
export const Edit3 = createCompatIcon('Edit3');
export const Eye = createCompatIcon('Eye');
export const EyeOff = createCompatIcon('EyeOff');
export const FileText = createCompatIcon('FileText');
export const FolderTree = createCompatIcon('FolderTree');
export const History = createCompatIcon('History');
export const Info = createCompatIcon('Info');
export const KeyRound = createCompatIcon('KeyRound');
export const Loader2 = createCompatIcon('Loader2');
export const MapPin = createCompatIcon('MapPin');
export const MessageSquare = createCompatIcon('MessageSquare');
export const MessageSquarePlus = createCompatIcon('MessageSquarePlus');
export const MousePointer = createCompatIcon('MousePointer');
export const Pen = createCompatIcon('Pen');
export const PenLine = createCompatIcon('PenLine');
export const Play = createCompatIcon('Play');
export const Plug = createCompatIcon('Plug');
export const Plus = createCompatIcon('Plus');
export const RefreshCw = createCompatIcon('RefreshCw');
export const RotateCcw = createCompatIcon('RotateCcw');
export const Save = createCompatIcon('Save');
export const Scale = createCompatIcon('Scale');
export const Search = createCompatIcon('Search');
export const Send = createCompatIcon('Send');
export const Server = createCompatIcon('Server');
export const Settings = createCompatIcon('Settings');
export const Tag = createCompatIcon('Tag');
export const Trash2 = createCompatIcon('Trash2');
export const Unplug = createCompatIcon('Unplug');
export const User = createCompatIcon('User');
export const Wrench = createCompatIcon('Wrench');
export const X = createCompatIcon('X');
export const Zap = createCompatIcon('Zap');
