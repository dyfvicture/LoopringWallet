import { BaseWallet } from 'libs/wallet/base';
import { connect } from 'react-redux';
import { showNotification } from 'actions/notifications';

type Props = {
  wallet: ?BaseWallet,
  showNotification: (
    level: string,
    msg: string,
    duration?: number
  ) => ShowNotificationAction
};

export class LoopringOrderHistory extends React.component {}
function mapStateToProps(state: AppState) {
  return {
    wallet: state.wallet.inst
  };
}

export default connect(mapStateToProps, { showNotification })(
  LoopringOrderHistory
);
