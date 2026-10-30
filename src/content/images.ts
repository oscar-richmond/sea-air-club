/**
 * Image registry. One place for every image, its alt text and its framing,
 * so components refer to images by key and alt text is never forgotten.
 *
 * All current images are pre-launch visualisations (AI exteriors from Freddie and
 * interior renders by Darby Holmes). Final photography replaces them after the
 * 20 November shoot.
 */
import type { ImageMetadata } from 'astro';

import exterior1 from '../assets/images/exteriors/exterior-1.jpg';
import exterior2 from '../assets/images/exteriors/exterior-2.jpg';
import exterior3 from '../assets/images/exteriors/exterior-3.jpg';
import exterior4 from '../assets/images/exteriors/exterior-4.jpg';
import landBedroom from '../assets/images/interiors/land-bedroom.jpg';
import landKitchen from '../assets/images/interiors/land-kitchen.jpg';
import seaBedroom from '../assets/images/interiors/sea-bedroom.jpg';
import seaKitchen from '../assets/images/interiors/sea-kitchen.jpg';

export interface SiteImage {
  src: ImageMetadata;
  alt: string;
}

export const images = {
  'exterior-1': {
    src: exterior1,
    alt: 'Visualisation of a timber-clad Sea Air Club cabin in a grassy field, with a table and two wicker chairs on the lawn',
  },
  'exterior-2': {
    src: exterior2,
    alt: 'Visualisation of a green cabin set low in rolling Devon fields, with hedgerows and countryside beyond',
  },
  'exterior-3': {
    src: exterior3,
    alt: 'Visualisation of an outdoor table laid for breakfast with flowers and a fire pit, looking over green fields',
  },
  'exterior-4': {
    src: exterior4,
    alt: 'Visualisation of a timber cabin with an outdoor shower, two Adirondack chairs and planters on the grass',
  },
  'land-bedroom': {
    src: landBedroom,
    alt: 'Interior render of a cabin bedroom with a tall upholstered headboard, a green wardrobe and a fish painting',
  },
  'land-kitchen': {
    src: landKitchen,
    alt: 'Interior render of a cabin with a red kitchen, a wood-burning stove and a stable door',
  },
  'sea-bedroom': {
    src: seaBedroom,
    alt: 'Interior render of a cabin bedroom with a striped headboard, a blue wardrobe and wall lights',
  },
  'sea-kitchen': {
    src: seaKitchen,
    alt: 'Interior render of a cabin kitchen with navy units, open shelves and a wood-burning stove',
  },
} satisfies Record<string, SiteImage>;

export type ImageKey = keyof typeof images;
