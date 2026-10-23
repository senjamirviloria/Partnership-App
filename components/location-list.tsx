import Icon from "@mdi/react";
import { mdiMapMarkerOutline, mdiOpenInNew } from "@mdi/js";

import { formatLocations } from "@/lib/locations";

type Props = {
  locations: string | null;
  emptyText?: string;
};

/** Show a separate Google Maps search beside each location. */
export const LocationList = ({ locations, emptyText }: Props) => {
  const entries = formatLocations(locations);
  if (!entries.length) return emptyText ? <span>{emptyText}</span> : null;

  return (
    <ul className="location-list">
      {entries.map((location, index) => (
        <li key={`${index}-${location}`} className="location-row">
          <span className="location-name">{location}</span>
          <a
            className="location-map-link"
            href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(location)}`}
            target="_blank"
            rel="noopener noreferrer"
            aria-label={`Search ${location} in Google Maps (opens in a new tab)`}
            title={`Search ${location} in Google Maps (opens in a new tab)`}
          >
            <Icon path={mdiMapMarkerOutline} size={0.65} aria-hidden="true" />
            Map
            <Icon path={mdiOpenInNew} size={0.55} aria-hidden="true" />
          </a>
        </li>
      ))}
    </ul>
  );
};
