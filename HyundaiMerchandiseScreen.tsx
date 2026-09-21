import MerchandiseScreen from './MerchandiseScreen';
export default function HyundaiMerchandiseScreen(props: any) {
  return <MerchandiseScreen {...props} route={{ ...(props.route ?? {}), params: { ...(props.route?.params ?? {}), brand: 'Hyundai' } }} />;
}
