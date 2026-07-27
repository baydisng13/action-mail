import * as React from "react";
import { CheckIcon, ChevronsUpDown } from "lucide-react";
import * as RPNInput from "react-phone-number-input";
import flags from "react-phone-number-input/flags";
// @ts-ignore - libphonenumber-js types may not be available
import { parsePhoneNumber } from "libphonenumber-js";

import { Button } from "@/components/ui/button";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { Input } from "@/components/ui/input";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { ScrollArea } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils";

type PhoneInputProps = Omit<
  React.ComponentProps<"input">,
  "onChange" | "value" | "ref"
> &
  Omit<RPNInput.Props<typeof RPNInput.default>, "onChange"> & {
    onChange?: (value: string) => void;
    value?: string;
  };

// Format E164 number to [countrycode]-[number] format
const formatPhoneValue = (e164Value: RPNInput.Value | undefined): string => {
  if (!e164Value) return "";
  
  try {
    // Parse the phone number to get country code and national number
    const phoneNumber = parsePhoneNumber(e164Value);
    if (phoneNumber) {
      const countryCode = `+${phoneNumber.countryCallingCode}`;
      // Remove leading zero from national number if present
      let nationalNumber = String(phoneNumber.nationalNumber).replace(/^0+/, "");
      return `${countryCode}-${nationalNumber}`;
    }
  } catch (error) {
    // If parsing fails, fall back to simple regex
    // E164 format is like "+251900000000"
    // Try to extract country code (1-4 digits after +)
    const match = e164Value.match(/^(\+\d{1,4})(.+)$/);
    if (match) {
      const countryCode = match[1];
      // Remove leading zero from number if present
      const number = match[2].replace(/^0+/, "");
      return `${countryCode}-${number}`;
    }
  }
  
  return e164Value;
};

// Parse [countrycode]-[number] format back to E164
const parsePhoneValue = (formattedValue: string | undefined): RPNInput.Value | undefined => {
  if (!formattedValue) return undefined;
  
  // If already in E164 format, return as is
  if (formattedValue.startsWith("+") && !formattedValue.includes("-")) {
    return formattedValue as RPNInput.Value;
  }
  
  // Parse [countrycode]-[number] format
  const match = formattedValue.match(/^(\+\d{1,4})[- ]?(.+)$/);
  if (match) {
    return `${match[1]}${match[2]}` as RPNInput.Value;
  }
  
  return formattedValue as RPNInput.Value;
};

const PhoneInput: React.ForwardRefExoticComponent<PhoneInputProps> =
  React.forwardRef<React.ElementRef<typeof RPNInput.default>, PhoneInputProps>(
    ({ className, onChange, value, defaultCountry = "ET", ...props }, ref) => {
      const e164Value = parsePhoneValue(value);
      
      return (
        <RPNInput.default
          ref={ref}
          className={cn("flex w-full", className)}
          flagComponent={FlagComponent}
          countrySelectComponent={CountrySelect}
          inputComponent={InputComponent}
          smartCaret={false}
          value={e164Value}
          defaultCountry={defaultCountry as RPNInput.Country}
          /**
           * Handles the onChange event.
           *
           * Converts E164 format to [countrycode]-[number] format
           *
           * @param {E164Number | undefined} value - The entered value
           */
          onChange={(e164Value) => {
            if (!e164Value) {
              onChange?.(undefined as any);
              return;
            }
            const formatted = formatPhoneValue(e164Value);
            onChange?.(formatted);
          }}
          {...props}
        />
      );
    },
  );
PhoneInput.displayName = "PhoneInput";

const InputComponent = React.forwardRef<
  HTMLInputElement,
  React.ComponentProps<"input">
>(({ className, value, onChange, ...props }, ref) => {
  // Extract just the national number for display (remove country code and any spaces)
  const getDisplayValue = (val: unknown): string => {
    if (!val) return "";
    const str = String(val);
    // Remove +countrycode prefix and any spaces (e.g., "+251 99 801 9084" -> "998019084")
    return str.replace(/^\+\d{1,4}\s*/, "").replace(/\s/g, "");
  };
  
  const displayValue = getDisplayValue(value);
  
  return (
    <Input
      className={cn(
        "rounded-e-lg rounded-s-none border-l-0 w-full h-10 bg-[#F4F4F5] border-0 focus:ring-2 focus:ring-primary",
        className
      )}
      value={displayValue}
      onChange={onChange}
      {...props}
      ref={ref}
    />
  );
});
InputComponent.displayName = "InputComponent";

type CountryEntry = { label: string; value: RPNInput.Country | undefined };

type CountrySelectProps = {
  disabled?: boolean;
  value: RPNInput.Country;
  options: CountryEntry[];
  onChange: (country: RPNInput.Country) => void;
};

const CountrySelect = ({
  disabled,
  value: selectedCountry,
  options: countryList,
  onChange,
}: CountrySelectProps) => {
  const scrollAreaRef = React.useRef<HTMLDivElement>(null);
  const [searchValue, setSearchValue] = React.useState("");
  const [isOpen, setIsOpen] = React.useState(false);

  return (
    <Popover
      open={isOpen}
      modal
      onOpenChange={(open) => {
        setIsOpen(open);
        open && setSearchValue("");
      }}
    >
      <PopoverTrigger asChild>
          <button
          type="button"
          className="flex gap-1 rounded-s-lg border-r-0 px-1 py-0! h-10 w-12 focus:z-10 bg-[#F4F4F5] hover:bg-[#E4E4E5] border-0 items-center justify-center"
          disabled={disabled}
        >
          <FlagComponentInput
            country={selectedCountry}
            countryName={selectedCountry}
          />
          <ChevronsUpDown
            className={cn(
              " size-3 stroke-1 opacity-50",
              disabled ? "hidden" : "opacity-100",
            )}
          />
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-[300px] p-0 z-[100000]">
        <Command>
          <CommandInput
            value={searchValue}
            onValueChange={(value) => {
              setSearchValue(value);
              setTimeout(() => {
                if (scrollAreaRef.current) {
                  const viewportElement = scrollAreaRef.current.querySelector(
                    "[data-radix-scroll-area-viewport]",
                  );
                  if (viewportElement) {
                    viewportElement.scrollTop = 0;
                  }
                }
              }, 0);
            }}
            placeholder="Search country..."
          />
          <CommandList>
            <ScrollArea ref={scrollAreaRef} className="h-72">
              <CommandEmpty>No country found.</CommandEmpty>
              <CommandGroup>
                {countryList.map(({ value, label }) =>
                  value ? (
                    <CountrySelectOption
                      key={value}
                      country={value}
                      countryName={label}
                      selectedCountry={selectedCountry}
                      onChange={onChange}
                      onSelectComplete={() => setIsOpen(false)}
                    />
                  ) : null,
                )}
              </CommandGroup>
            </ScrollArea>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
};

interface CountrySelectOptionProps extends RPNInput.FlagProps {
  selectedCountry: RPNInput.Country;
  onChange: (country: RPNInput.Country) => void;
  onSelectComplete: () => void;
}

const CountrySelectOption = ({
  country,
  countryName,
  selectedCountry,
  onChange,
  onSelectComplete,
}: CountrySelectOptionProps) => {
  const handleSelect = () => {
    onChange(country);
    onSelectComplete();
  };

  return (
    <CommandItem className="gap-2" onSelect={handleSelect}>
      <FlagComponent country={country} countryName={countryName} />
      <span className="flex-1 text-sm">{countryName}</span>
      <span className="text-sm text-foreground/50">{`+${RPNInput.getCountryCallingCode(country)}`}</span>
      <CheckIcon
        className={`ml-auto size-4 ${country === selectedCountry ? "opacity-100" : "opacity-0"}`}
      />
    </CommandItem>
  );
};

const FlagComponent = ({ country, countryName }: RPNInput.FlagProps) => {
  const Flag = flags[country];

  return (
    <span className="flex h-4 w-6 overflow-hidden rounded-sm bg-transparent [&_svg:not([class*='size-'])]:size-full">
      {Flag && <Flag title={countryName} />}
    </span>
  );
};
const FlagComponentInput = ({ country, countryName }: RPNInput.FlagProps) => {
  const Flag = flags[country];

  return (
    <span className="flex h-4 w-6 overflow-hidden rounded-sm bg-transparent [&_svg:not([class*='size-'])]:size-full">
      {Flag && <Flag title={countryName} />}
    </span>
  );
};

export { PhoneInput };
