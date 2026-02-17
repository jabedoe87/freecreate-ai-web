import { Navigate } from "react-router-dom";

const Redirect = ({ to }: { to: string }) => <Navigate to={to} replace />;

export default Redirect;
