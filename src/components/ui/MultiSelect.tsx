import * as React from "react";
import { Check, ChevronsUpDown, X, Search } from "lucide-react";

interface MultiSelectProps {
    options: { label: string; value: string }[];
    selected: string[];
    onChange: (selected: string[]) => void;
    placeholder?: string;
    label?: string;
    className?: string;
}

export function MultiSelect({
    options,
    selected,
    onChange,
    placeholder = "Select options...",
    label,
    className = "",
}: MultiSelectProps) {
    const [open, setOpen] = React.useState(false);
    const [searchQuery, setSearchQuery] = React.useState("");
    const dropdownRef = React.useRef<HTMLDivElement>(null);

    // Close on click outside
    React.useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
                setOpen(false);
            }
        };
        document.addEventListener("mousedown", handleClickOutside);
        return () => document.removeEventListener("mousedown", handleClickOutside);
    }, []);

    const filteredOptions = React.useMemo(() => {
        return options.filter((option) =>
            option.label.toLowerCase().includes(searchQuery.toLowerCase())
        );
    }, [options, searchQuery]);

    const handleSelect = (value: string) => {
        if (selected.includes(value)) {
            onChange(selected.filter((item) => item !== value));
        } else {
            onChange([...selected, value]);
        }
    };

    const handleSelectAll = () => {
        if (selected.length === filteredOptions.length) {
            // If all visible are selected, deselect them
            const newSelected = selected.filter(
                (s) => !filteredOptions.some((o) => o.value === s)
            );
            onChange(newSelected);
        } else {
            // Select all visible
            const newSelected = [...selected];
            filteredOptions.forEach((option) => {
                if (!newSelected.includes(option.value)) {
                    newSelected.push(option.value);
                }
            });
            onChange(newSelected);
        }
    };

    const handleClear = (e: React.MouseEvent) => {
        e.stopPropagation();
        onChange([]);
    };

    return (
        <div className={`relative ${className}`} ref={dropdownRef}>
            {label && <label className="block text-xs font-semibold text-slate-500 mb-1">{label}</label>}

            <button
                type="button"
                className={`w-full flex items-center justify-between bg-white border border-slate-200 hover:bg-slate-50 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${selected.length > 0 ? "border-indigo-200 bg-indigo-50/30" : "text-slate-700"} ${className}`}
                onClick={() => setOpen(!open)}
            >
                <div className="flex items-center gap-2 overflow-hidden">
                    <span className={`truncate ${selected.length === 0 ? "text-slate-500" : "text-slate-900 font-medium"}`}>
                        {selected.length === 0
                            ? placeholder
                            : selected.length === 1
                                ? options.find((o) => o.value === selected[0])?.label || selected[0]
                                : `${selected.length} selected`}
                    </span>
                </div>
                <div className="flex items-center gap-1">
                    {selected.length > 0 && (
                        <div
                            role="button"
                            onClick={handleClear}
                            className="p-1 hover:bg-slate-200 rounded-full text-slate-400 hover:text-red-500 transition-colors mr-1"
                        >
                            <X className="w-3 h-3" />
                        </div>
                    )}
                    <ChevronsUpDown className="w-4 h-4 text-slate-400 shrink-0" />
                </div>
            </button>

            {open && (
                <div className="absolute z-50 w-full mt-1 bg-white border border-slate-200 rounded-lg shadow-xl max-h-60 flex flex-col min-w-[200px]">
                    {/* Search */}
                    <div className="p-2 border-b border-slate-100 flex items-center gap-2 sticky top-0 bg-white rounded-t-lg">
                        <Search className="w-4 h-4 text-slate-400" />
                        <input
                            type="text"
                            placeholder="Search..."
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                            className="w-full text-sm border-none focus:ring-0 p-0 text-slate-700 placeholder:text-slate-400"
                            autoFocus
                        />
                    </div>

                    {/* Quick Actions */}
                    {filteredOptions.length > 0 && (
                        <div className="px-2 py-1.5 border-b border-slate-100 bg-slate-50/50 flex justify-between">
                            <button
                                onClick={handleSelectAll}
                                className="text-xs font-medium text-indigo-600 hover:text-indigo-700"
                            >
                                {selected.length === filteredOptions.length ? "Deselect All" : "Select All"}
                            </button>
                            <span className="text-xs text-slate-400">
                                {filteredOptions.length} option{filteredOptions.length !== 1 ? 's' : ''}
                            </span>
                        </div>
                    )}

                    {/* Options List */}
                    <div className="overflow-y-auto p-1 flex-1">
                        {filteredOptions.length === 0 ? (
                            <div className="p-3 text-center text-sm text-slate-500">No options found.</div>
                        ) : (
                            filteredOptions.map((option) => {
                                const isSelected = selected.includes(option.value);
                                return (
                                    <div
                                        key={option.value}
                                        onClick={() => handleSelect(option.value)}
                                        className={`flex items-center gap-2 px-2 py-1.5 rounded-md cursor-pointer transition-colors ${isSelected ? "bg-indigo-50 text-indigo-900" : "hover:bg-slate-50 text-slate-700"
                                            }`}
                                    >
                                        <div className={`w-4 h-4 rounded border flex items-center justify-center transition-colors ${isSelected ? "bg-indigo-600 border-indigo-600" : "border-slate-300 bg-white"
                                            }`}>
                                            {isSelected && <Check className="w-3 h-3 text-white" />}
                                        </div>
                                        <span className="text-sm truncate">{option.label}</span>
                                    </div>
                                );
                            })
                        )}
                    </div>
                </div>
            )}
        </div>
    );
}
