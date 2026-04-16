import { CloudUpload, DatabaseZap } from "lucide-react";
import { motion } from "framer-motion";

export default function SavingPage({ message, title = "Syncing" }) {
  return (
    <div className="saving-stage">
      <div className="panel center saving-panel">
        <h2 className="saving-title"><DatabaseZap /> {title}</h2>
        <div className="saving-gridfx" aria-hidden="true" />
        <motion.div className="saving-pulse-core" animate={{ scale: [1, 1.12, 1], opacity: [0.62, 1, 0.62] }} transition={{ duration: 1.5, repeat: Infinity, ease: "easeInOut" }} />
        <motion.div className="saving-orbital" animate={{ rotate: 360 }} transition={{ duration: 5, repeat: Infinity, ease: "linear" }}>
          <span className="saving-ring" />
          <span className="saving-ring saving-ring-2" />
          <CloudUpload className="saving-cloud" />
        </motion.div>
        <motion.div className="saving-data-beams" aria-hidden="true" animate={{ opacity: [0.4, 1, 0.4] }} transition={{ duration: 1.3, repeat: Infinity, ease: "easeInOut" }}>
          <i />
          <i />
          <i />
          <i />
          <i />
        </motion.div>
        <p className="lead saving-message">{message}</p>
      </div>
    </div>
  );
}
