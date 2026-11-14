import { requireOptionalNativeModule } from 'expo';

export type LinkDelivery = {
  id: string;
  sequence: number;
  url: string;
};

export type NativeLinks = {
  pending(): LinkDelivery[];
  acknowledge(id: string): Promise<void>;
  addListener(
    name: 'onLinkDeliveries',
    listener: (event: { deliveries: LinkDelivery[] }) => void,
  ): { remove(): void };
};

// Android only. Pending URLs are removed from local storage on acknowledgement.
export default requireOptionalNativeModule<NativeLinks>('OpaxLinks');
