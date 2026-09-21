import MerchandiseScreen from './MerchandiseScreen';
export default function KiaMerchandiseScreen(props: any) {
  return <MerchandiseScreen {...props} route={{ ...(props.route ?? {}), params: { ...(props.route?.params ?? {}), brand: 'Kia' } }} />;
}
