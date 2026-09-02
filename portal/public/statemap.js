/**
 * OPAX state map — Australia as an engraved plate, one way into the record by place.
 *
 * Ported from corpuskit's Explore home (RegionMap.tsx + australia-paths.ts) and
 * restyled to the site's register: hairline bronze outlines on paper, a bronze
 * wash under the pointer, Public Sans labels, no shadows. Plain browser ES
 * module, no dependencies.
 *
 *   import { mountStateMap } from '/statemap.js'
 *   const sm = mountStateMap(container, { manifest })   // manifest = parsed /corpus.json
 *   sm.destroy()
 *
 * The corpus holds five parliaments: the Commonwealth and NSW, VIC, SA and QLD.
 * Each state with a parliament in the record is labelled with its speech count
 * and links to the search filtered to that parliament; Queensland and Victoria
 * also offer their state donations file. Western Australia, the Northern
 * Territory and Tasmania are drawn dimmed: not yet in the record. Counts and
 * coverage are read from the manifest's `sources`, never typed in here, so the
 * plate cannot claim more than the index holds.
 *
 * Geometry: public state boundaries (rowanhogan/australian-states), projected
 * equirectangular with a cosine latitude correction, Ramer-Douglas-Peucker
 * simplified; label points are each shape's pole of inaccessibility. Generated
 * upstream - do not hand-edit the paths.
 */

const MAP_WIDTH = 1000
const MAP_HEIGHT = 898

const STATES = [
  {
    id: "wa", label: "Western Australia", labelX: 226.4, labelY: 434.9,
    path: "M32.8,432.9L31.4,430.5L32.1,423.0L35.4,432.1L35.0,435.3L36.2,429.9L37.6,438.7L38.4,434.8L39.2,440.3L39.7,438.4L42.5,438.7L44.3,436.0L44.3,431.4L37.2,425.1L34.6,414.8L34.6,416.9L33.3,415.3L35.6,409.4L35.9,412.2L41.5,419.3L40.1,427.8L42.7,427.2L44.2,421.1L46.4,431.6L48.9,434.8L52.7,430.8L51.6,422.1L53.3,422.1L53.3,419.6L47.2,412.4L42.8,400.7L39.2,396.7L38.7,392.9L40.2,392.2L38.1,392.4L38.2,389.4L33.1,382.5L32.7,375.6L36.0,363.8L41.8,355.9L41.4,346.5L43.0,342.1L38.9,332.2L47.6,313.0L51.6,312.0L48.9,321.0L49.8,325.6L51.3,325.0L50.4,331.1L53.7,328.3L55.1,330.5L62.3,312.8L68.6,308.7L73.9,307.9L81.3,303.9L82.2,304.9L85.9,298.8L90.1,297.1L92.2,292.6L97.6,290.8L98.9,286.1L100.8,287.4L104.9,286.3L109.1,281.9L108.3,283.3L109.7,283.7L113.2,278.1L114.5,278.0L112.6,281.6L113.6,282.8L115.8,283.6L121.9,279.7L121.7,282.6L126.6,284.8L132.5,281.6L133.1,283.0L136.7,281.9L138.4,278.7L140.6,278.6L139.8,276.8L145.4,273.0L145.8,274.7L149.3,272.8L149.7,274.0L154.4,271.9L154.8,273.5L155.2,271.6L156.8,273.1L161.1,271.6L167.1,263.0L169.6,264.7L168.7,262.9L175.8,264.2L178.1,266.2L182.7,262.9L192.8,261.8L203.1,258.0L214.4,251.9L223.8,240.1L227.1,233.3L226.3,229.9L230.4,228.6L228.9,226.5L230.9,223.2L234.0,222.9L244.0,214.3L244.2,211.0L239.4,210.6L239.4,191.8L242.8,189.1L241.3,188.0L243.9,184.8L246.3,183.2L245.4,184.4L246.6,184.4L246.6,182.1L249.7,183.9L247.9,180.5L248.9,178.6L255.2,179.4L252.7,176.5L257.1,168.7L259.7,167.9L260.6,170.1L258.4,170.7L257.8,173.8L260.0,176.7L262.1,176.6L262.3,182.9L265.0,185.2L272.5,200.3L274.0,189.7L272.6,185.7L274.1,184.8L280.3,190.4L277.6,185.0L281.4,181.0L277.6,182.5L275.6,178.3L270.7,175.8L273.3,173.1L271.2,172.8L270.9,174.2L268.9,171.6L274.4,171.4L270.8,168.5L274.5,170.0L273.6,167.9L275.7,168.3L271.8,165.9L273.3,165.4L271.9,163.1L275.3,163.5L275.4,161.8L277.0,163.0L278.0,164.2L276.3,165.4L279.2,167.1L279.3,170.3L279.6,166.5L282.1,168.2L280.2,164.0L285.3,165.9L287.6,169.5L291.5,170.2L292.0,172.8L293.4,171.6L290.3,169.5L291.5,167.6L292.9,169.3L304.7,168.8L291.6,167.4L292.8,160.2L294.3,163.9L297.6,161.0L296.2,161.3L296.7,155.6L299.8,153.8L298.9,151.6L297.2,152.6L294.1,158.4L293.2,153.2L292.0,154.9L291.4,151.0L292.6,150.8L291.0,149.8L292.8,149.7L293.0,148.0L294.1,148.9L291.9,148.3L292.2,146.5L294.5,144.4L297.1,145.9L297.5,143.3L298.2,145.2L299.9,141.6L297.9,141.4L298.9,138.7L300.1,141.4L302.3,139.9L305.4,142.9L304.8,145.0L306.3,144.5L306.3,146.4L308.0,144.3L315.8,150.4L307.5,143.7L309.7,140.8L308.0,141.0L308.7,138.8L303.5,141.0L304.2,138.1L306.0,138.4L307.2,136.4L303.0,139.0L303.4,136.6L302.0,136.2L306.6,135.0L306.2,131.6L307.6,131.4L309.7,136.0L312.5,134.6L313.8,136.3L317.2,136.1L314.3,134.9L317.2,132.0L315.0,132.9L310.9,131.2L313.7,128.9L310.8,128.5L309.2,125.4L313.1,122.8L310.7,122.8L314.5,119.0L316.0,122.6L318.1,118.8L320.0,120.5L319.9,111.9L323.1,113.1L321.2,115.8L321.1,122.7L322.6,118.5L324.8,117.4L326.1,118.2L325.4,121.1L327.9,122.6L327.5,119.8L330.6,119.6L328.9,116.0L331.5,114.9L330.7,112.3L333.4,109.5L329.2,107.4L329.0,105.4L329.7,107.4L330.3,105.1L331.8,106.7L329.7,103.7L333.1,103.4L332.0,106.4L334.5,104.8L333.0,107.7L334.5,107.7L333.8,110.0L335.4,111.9L337.9,110.6L336.4,109.3L337.3,107.0L342.0,103.9L340.0,107.8L341.8,107.8L343.6,111.9L344.6,107.7L345.7,109.2L347.4,107.0L346.0,104.9L350.7,105.2L348.4,103.8L347.4,99.7L349.2,100.8L349.4,99.2L352.1,98.8L356.3,105.2L357.4,103.1L357.8,104.9L358.7,103.0L360.4,104.6L361.1,103.2L363.1,104.1L363.6,107.2L368.7,110.7L375.4,121.1L376.3,120.3L381.7,124.7L381.0,127.8L379.3,128.4L378.7,139.5L377.4,139.8L378.6,142.3L376.4,145.7L379.2,143.3L379.5,136.9L384.5,145.3L381.0,134.5L382.7,131.6L384.3,133.0L383.9,130.1L385.0,133.8L384.9,131.8L386.1,132.9L384.9,129.0L388.7,132.4L385.7,126.9L389.4,125.9L400.0,128.9L400.0,572.7L383.9,580.4L360.6,587.7L345.2,589.1L334.2,587.1L328.3,588.6L301.5,604.0L288.0,607.8L284.7,612.0L281.8,622.1L271.4,632.2L267.6,631.0L262.7,634.2L262.0,631.3L259.4,630.0L249.9,631.0L248.7,632.8L243.9,631.5L241.8,633.8L238.0,634.2L235.3,629.3L230.3,631.4L220.3,628.9L215.9,630.6L202.2,630.8L198.5,633.0L189.2,631.8L180.0,636.1L175.5,641.4L178.3,644.0L174.5,643.6L173.7,646.6L171.5,645.7L170.7,647.9L162.6,646.0L158.9,648.2L158.2,651.1L151.5,653.9L150.7,658.0L145.3,658.6L145.8,660.8L140.3,660.5L140.0,658.7L137.6,661.4L141.7,663.0L133.8,661.3L132.0,663.7L125.5,660.8L128.6,660.7L128.4,659.3L121.2,661.8L105.5,660.6L100.3,657.0L94.2,656.0L92.9,652.8L84.2,644.9L78.7,642.1L74.6,642.3L74.7,640.8L73.7,643.7L71.1,640.5L70.7,621.4L75.5,624.6L79.2,624.3L86.3,615.9L84.9,598.6L87.3,594.7L85.7,597.3L87.4,601.8L86.3,597.2L88.2,598.0L88.9,596.7L87.5,595.9L88.1,589.8L86.7,588.0L88.8,586.1L87.8,582.4L90.5,581.0L90.8,582.2L90.5,580.1L93.5,578.2L87.6,582.4L88.3,577.0L86.7,571.8L72.0,541.6L69.5,529.4L70.5,514.8L67.6,504.8L60.6,496.1L61.5,492.9L59.6,488.4L51.2,478.3L49.5,471.4L51.3,466.9L46.2,455.0L27.2,426.5L29.9,428.9L30.6,422.9L31.2,431.4L32.8,432.9Z",
  },
  {
    id: "nt", label: "Northern Territory", labelX: 505.9, labelY: 231.2,
    path: "M435.7,72.1L438.2,73.1L438.2,71.4L439.7,72.7L440.9,71.6L436.4,69.6L438.6,69.8L436.9,68.2L438.1,62.9L441.5,64.4L440.8,68.6L441.8,67.6L442.2,69.2L442.6,67.1L444.0,70.2L444.3,68.8L446.3,69.4L443.7,66.2L446.0,67.5L445.8,65.3L442.8,65.0L442.7,63.6L444.6,61.5L448.4,62.0L447.8,56.7L451.0,57.4L452.4,60.3L454.1,53.9L454.7,57.9L457.1,60.1L463.1,60.3L467.7,58.5L472.2,60.8L476.2,57.3L479.8,59.1L481.0,56.7L485.4,55.1L486.0,49.9L484.3,47.2L486.0,44.5L484.6,45.7L482.3,44.4L482.5,43.2L485.1,43.7L482.2,39.1L476.2,38.4L473.3,40.7L472.0,37.8L469.2,37.0L469.3,34.9L465.0,34.7L467.8,31.2L469.7,33.1L470.4,29.7L473.3,32.0L474.6,37.5L476.2,35.4L474.6,34.9L475.4,32.4L473.8,29.6L477.3,33.7L476.8,31.0L478.4,29.5L479.4,34.2L481.2,32.2L486.3,40.0L490.4,36.8L491.7,37.7L490.9,35.4L492.2,35.2L498.6,45.6L502.2,44.7L501.7,46.7L506.7,46.5L508.5,48.7L512.8,45.5L515.7,46.0L513.6,49.3L515.5,50.9L518.4,49.0L519.4,51.3L520.6,50.1L521.6,55.8L523.4,52.4L529.2,54.9L535.2,51.5L537.8,56.3L546.2,60.6L545.0,58.8L549.2,59.3L546.4,57.8L549.8,55.1L554.6,55.5L562.6,51.6L556.7,56.8L557.9,61.1L565.8,54.5L563.0,58.7L563.5,60.2L566.1,59.2L564.4,65.0L570.2,65.1L573.2,58.9L568.6,57.1L578.0,49.6L575.3,52.5L576.2,53.9L577.2,52.6L579.9,59.9L582.2,60.0L580.7,57.7L583.1,57.0L587.7,61.9L582.9,67.5L583.4,64.7L581.7,64.9L582.3,66.9L580.5,68.4L582.6,68.1L581.0,71.6L579.2,71.0L579.3,75.0L577.6,72.4L577.5,74.1L575.6,73.2L580.4,79.3L575.4,78.6L578.0,80.8L575.7,85.8L572.5,87.8L573.8,85.2L572.6,80.1L572.1,83.4L569.8,82.9L569.0,86.6L568.1,82.4L565.8,87.4L565.0,84.9L563.8,87.0L562.8,86.3L561.9,88.8L564.1,89.8L563.1,91.6L561.4,90.8L561.9,98.0L563.7,98.9L566.7,96.5L562.6,105.4L562.4,110.7L557.7,112.8L553.9,122.9L550.2,124.8L552.4,131.4L570.3,143.0L572.2,148.6L574.4,148.6L577.8,151.9L579.9,149.8L581.7,150.4L579.8,152.3L581.3,156.6L582.9,155.5L587.1,156.8L586.2,155.8L587.7,154.5L597.0,162.0L605.4,164.6L611.8,172.8L611.7,422.4L400.0,422.5L400.0,128.9L404.4,131.7L403.7,137.3L407.1,133.0L405.5,132.3L405.4,127.8L411.4,130.5L414.2,134.9L413.3,136.8L416.1,135.8L411.8,126.5L413.9,129.2L413.6,126.7L418.9,128.3L421.2,126.0L418.1,127.5L419.1,125.7L415.8,125.8L413.7,121.9L418.2,119.9L412.4,120.2L412.3,117.9L411.4,118.9L410.7,117.4L410.7,119.0L408.4,116.8L408.6,114.6L412.0,109.0L411.3,106.9L413.1,109.4L414.1,105.9L415.1,106.9L417.6,105.0L419.2,92.5L421.1,90.9L421.4,92.8L423.7,93.3L430.1,88.1L426.3,83.6L426.8,77.5L431.5,76.3L431.8,70.5L433.0,71.3L434.4,69.7L435.7,72.1Z",
  },
  {
    id: "sa", label: "South Australia", labelX: 564.5, labelY: 512.2,
    path: "M623.5,656.1L625.1,655.6L624.3,653.3L618.0,646.4L613.6,637.3L609.1,647.2L606.1,663.2L603.2,664.6L598.2,662.8L592.3,666.5L588.3,666.1L585.5,668.1L584.0,666.7L586.8,663.6L588.6,657.4L594.7,657.4L597.1,659.0L598.8,657.8L600.2,650.1L599.6,645.4L598.0,645.9L600.0,642.0L598.8,637.4L600.5,637.2L602.4,630.5L611.2,622.1L607.3,614.4L613.0,610.4L610.6,607.5L610.5,601.0L607.9,599.3L605.9,591.9L606.7,607.4L603.3,606.2L598.9,610.8L593.3,624.8L578.7,631.1L567.3,643.3L566.9,648.1L566.0,646.4L563.1,647.7L563.2,650.9L561.3,651.4L562.2,653.6L559.7,655.2L564.9,653.2L563.6,660.4L559.8,656.5L555.7,658.7L547.1,648.4L543.7,649.3L546.0,645.1L546.4,647.0L549.5,647.6L548.2,648.4L549.8,650.7L553.3,650.0L551.3,649.7L550.7,647.2L550.3,649.5L549.3,640.8L546.9,637.7L547.1,633.3L537.2,623.9L537.5,618.9L533.1,613.5L534.6,613.4L534.2,612.0L530.8,611.6L532.7,612.2L532.5,613.9L528.3,611.2L526.3,612.0L524.1,608.0L525.4,612.6L523.1,608.5L521.6,608.8L522.4,606.4L519.1,604.9L520.9,603.1L519.1,600.0L522.5,600.1L521.2,600.1L522.9,601.8L524.5,599.3L523.9,596.1L519.0,592.6L514.1,595.3L514.5,591.5L516.5,591.2L513.4,587.1L510.1,586.3L509.8,583.7L508.1,583.3L507.1,585.4L505.2,583.6L503.4,584.7L505.6,586.4L497.1,586.5L496.2,584.3L488.2,579.6L483.1,579.3L481.1,580.2L481.7,581.8L475.3,581.7L464.9,573.6L450.6,566.8L442.5,570.6L427.1,569.8L400.0,572.7L400.0,422.5L682.3,422.4L681.5,740.9L674.4,741.0L668.2,737.3L661.7,727.0L655.1,721.5L651.1,711.9L655.1,708.8L655.3,703.7L650.7,692.5L644.2,683.8L629.7,673.9L624.1,677.2L614.0,676.7L622.1,669.4L623.4,654.0L623.5,656.1Z",
  },
  {
    id: "qld", label: "Queensland", labelX: 773.7, labelY: 353.6,
    path: "M698.0,132.1L694.7,118.5L696.4,108.3L693.3,102.0L694.7,94.3L698.7,86.4L696.1,79.1L703.4,68.5L699.0,66.5L696.3,67.6L702.4,52.4L703.7,51.6L703.9,57.2L706.2,53.8L704.5,51.4L708.7,36.1L709.0,25.0L713.3,24.2L716.2,18.7L718.4,18.2L720.2,19.8L717.2,25.8L719.7,22.9L724.4,28.4L726.3,36.5L726.0,48.7L728.8,51.0L731.7,50.0L735.2,52.0L731.3,57.0L731.3,61.7L735.2,62.8L736.5,67.4L739.7,69.0L737.7,76.6L742.2,75.1L741.5,86.1L743.5,90.4L741.9,99.1L747.8,116.2L750.2,118.4L753.6,118.3L756.9,115.7L757.6,112.5L761.0,113.8L765.1,110.0L766.8,115.2L768.3,115.1L767.5,118.2L769.2,120.6L774.4,121.8L775.4,125.3L781.9,127.6L783.1,130.9L784.7,130.7L782.0,135.7L782.7,138.7L784.5,138.0L784.9,139.3L781.8,144.2L784.1,147.1L784.9,156.1L787.7,160.5L786.1,170.6L794.8,183.3L796.4,181.5L799.0,182.1L797.4,186.4L801.7,195.3L800.7,199.4L801.6,198.3L803.5,202.0L800.4,217.7L804.5,223.8L808.0,225.2L806.8,234.8L810.7,239.6L818.1,242.5L820.8,245.7L822.5,245.8L823.9,242.5L826.5,248.8L833.9,248.8L833.4,246.2L839.3,259.5L841.4,259.9L841.2,256.3L842.9,256.4L845.1,261.7L848.9,261.0L853.2,263.5L852.5,265.3L855.4,268.4L858.0,267.7L857.7,265.6L860.3,265.8L860.8,269.3L863.0,268.8L862.9,271.5L865.2,270.3L868.9,278.2L864.9,275.1L865.0,276.7L863.1,275.7L862.6,279.5L866.9,287.2L871.7,287.9L870.9,290.3L875.9,292.1L875.8,294.4L874.2,294.3L875.7,294.3L874.8,298.0L877.6,297.7L877.4,303.9L879.9,303.5L881.0,306.2L882.0,304.5L881.9,310.1L880.5,310.9L881.5,314.9L884.6,324.3L888.6,326.7L888.3,328.4L889.7,327.0L895.2,334.3L892.1,325.9L895.1,320.2L898.3,326.4L905.7,330.7L907.0,333.2L907.3,325.3L909.3,326.0L908.9,328.6L909.8,326.0L911.8,328.7L911.2,330.6L909.3,329.4L910.8,333.7L912.6,330.9L913.8,335.0L911.8,346.7L913.6,349.5L912.2,351.3L914.6,356.0L912.7,356.8L914.8,357.9L914.3,359.7L916.1,357.7L915.9,359.7L918.3,358.4L921.7,364.8L925.1,365.9L927.7,369.4L928.0,371.7L928.1,370.4L929.3,371.5L928.0,369.5L930.4,370.5L930.5,372.7L931.1,370.7L933.7,372.5L932.0,369.2L934.8,370.3L934.5,372.0L935.6,370.1L935.8,373.1L938.3,374.2L937.6,375.5L938.5,373.7L942.2,383.6L952.2,391.3L953.7,398.5L956.1,400.1L954.0,401.5L962.7,403.9L962.9,407.5L960.6,409.2L963.7,407.6L961.5,410.7L961.8,414.2L964.1,416.5L963.2,417.6L965.2,418.0L964.7,421.7L965.8,417.5L967.5,420.8L969.2,420.8L966.1,430.8L968.3,443.7L965.3,448.6L968.1,450.9L965.2,452.2L965.6,454.1L967.5,454.2L967.2,455.8L966.0,455.0L966.3,457.2L968.5,458.9L966.0,461.1L969.2,458.6L969.1,461.5L972.2,464.3L971.7,467.7L974.5,465.9L974.7,469.5L973.3,470.1L977.3,480.0L968.9,481.9L967.3,484.8L961.9,483.5L958.8,484.9L955.6,482.5L954.8,484.3L952.1,482.2L950.3,485.1L940.1,489.0L943.0,494.0L941.4,499.3L935.9,500.7L934.3,498.4L930.5,500.5L926.9,506.4L924.2,504.4L924.1,500.1L918.7,497.6L917.9,494.9L911.8,492.1L904.6,492.9L900.9,489.5L887.1,492.1L882.4,490.5L872.5,497.6L869.6,501.7L682.3,501.7L682.3,422.4L611.7,422.4L611.8,172.8L619.4,178.3L626.6,178.7L636.2,182.5L639.0,185.6L640.9,193.3L654.6,199.9L658.9,203.7L672.8,200.6L679.7,194.9L681.4,184.8L689.3,171.5L692.5,160.4L691.1,156.3L692.6,149.4L698.0,132.1Z",
  },
  {
    id: "nsw", label: "New South Wales", labelX: 828.2, labelY: 593.5,
    path: "M921.1,629.1L918.9,629.1L922.1,630.5L924.3,629.4L923.9,632.9L920.4,633.5L923.1,634.5L919.1,635.5L921.7,636.1L916.0,642.1L915.8,646.8L912.9,648.2L915.4,649.5L911.8,656.4L913.7,662.2L912.4,662.4L911.8,660.0L909.9,661.2L910.6,663.4L907.0,662.9L908.2,665.2L905.4,667.9L903.7,674.3L900.6,679.3L898.3,678.8L899.7,681.4L897.7,683.7L897.6,693.6L891.9,710.8L892.8,714.4L891.1,715.2L894.2,716.7L895.3,719.9L892.8,720.3L893.6,726.3L849.6,707.7L852.2,702.4L847.9,696.9L847.1,687.8L840.2,684.7L836.5,686.7L833.1,685.1L831.1,688.2L826.4,686.5L824.8,689.4L822.2,689.7L814.4,685.9L804.4,687.7L797.7,685.3L795.6,686.4L789.1,681.4L784.8,683.1L779.2,681.9L775.7,683.0L774.7,686.3L776.0,688.5L773.3,688.2L771.2,690.0L767.5,688.6L762.5,684.1L761.2,680.5L752.2,673.4L744.0,670.4L742.8,665.7L738.7,665.3L737.0,661.2L737.6,654.7L732.1,651.8L726.7,651.7L724.5,648.2L722.4,649.6L720.9,654.4L718.2,653.8L716.9,648.7L714.5,647.8L715.2,642.7L711.4,641.9L711.1,638.6L707.8,638.4L706.8,636.4L698.3,636.5L694.4,639.5L694.0,637.9L690.0,637.4L688.0,635.4L682.4,634.8L682.3,501.7L869.6,501.7L872.5,497.6L882.4,490.5L887.1,492.1L900.9,489.5L904.6,492.9L911.8,492.1L917.9,494.9L918.7,497.6L924.1,500.1L924.2,504.4L926.9,506.4L930.5,500.5L934.3,498.4L935.9,500.7L941.4,499.3L943.0,494.0L940.1,489.0L950.3,485.1L952.1,482.2L954.8,484.3L955.6,482.5L958.8,484.9L961.9,483.5L967.3,484.8L968.9,481.9L977.8,479.8L976.3,481.2L977.4,480.2L977.8,481.6L977.8,479.8L979.0,497.6L977.1,498.4L978.6,498.5L972.8,509.6L972.6,519.6L964.4,547.5L966.8,552.2L966.2,556.1L958.9,576.9L953.2,584.1L954.6,586.7L953.9,592.7L949.1,594.9L946.0,599.5L940.4,598.2L939.7,600.4L945.6,600.5L936.2,605.3L934.9,604.1L936.6,605.2L933.2,609.6L932.0,606.5L932.1,609.5L930.6,609.0L929.6,611.0L931.0,612.0L931.3,610.1L931.7,611.6L932.6,609.2L932.7,612.0L929.5,616.5L930.9,613.6L928.0,615.5L929.5,616.9L927.5,621.2L923.7,622.4L923.9,620.2L922.3,620.5L923.2,619.4L922.3,621.5L921.6,618.6L919.4,619.2L921.3,619.7L920.1,622.9L921.8,621.0L923.5,622.7L921.2,624.7L924.5,622.5L925.0,625.0L925.5,622.8L924.7,629.1L922.5,627.8L923.5,629.9L921.1,629.1Z",
  },
  {
    id: "vic", label: "Victoria", labelX: 724.1, labelY: 707.6,
    path: "M779.6,749.7L777.2,752.3L773.8,752.6L768.3,747.4L774.7,748.6L779.3,743.3L778.8,740.1L774.1,735.3L764.9,741.8L761.4,742.2L764.2,743.8L769.2,742.6L769.6,745.0L767.6,746.1L768.8,746.4L760.8,748.0L741.4,762.1L714.6,748.6L709.3,749.8L699.8,746.1L696.5,747.7L697.1,750.1L691.2,749.6L689.3,745.2L681.5,740.9L681.5,633.3L682.9,635.4L694.0,637.9L694.4,639.5L699.5,636.2L709.8,637.8L711.6,639.3L711.4,641.9L715.2,642.7L714.5,647.8L716.9,648.7L719.0,654.3L722.3,652.9L722.1,650.1L724.5,648.2L726.7,651.7L732.1,651.8L737.6,654.7L737.0,661.2L738.7,665.3L742.8,665.7L744.0,670.4L752.2,673.4L770.0,689.7L776.0,688.5L774.7,686.3L776.3,682.7L784.8,683.1L789.1,681.4L795.6,686.4L797.7,685.3L799.3,687.0L808.7,687.9L811.8,685.5L822.2,689.7L824.8,689.4L826.4,686.5L831.1,688.2L833.1,685.1L836.5,686.7L840.2,684.7L845.0,686.5L847.9,690.3L847.9,696.9L852.2,702.4L849.6,707.7L893.6,726.3L888.8,727.7L882.0,733.5L853.9,734.4L842.1,738.2L820.8,756.2L821.8,755.1L813.0,758.0L805.0,757.7L806.9,763.3L811.3,760.3L810.0,769.3L808.1,769.1L803.1,761.5L800.8,760.9L798.1,763.4L794.5,757.0L790.7,757.3L785.2,753.6L786.3,750.2L789.4,749.2L788.0,745.6L782.5,745.3L780.8,749.3L782.0,750.2L779.6,749.7Z",
  },
  {
    id: "tas", label: "Tasmania", labelX: 811.8, labelY: 848,
    path: "M770.7,820.3L767.2,818.9L769.7,814.9L770.0,809.2L771.0,811.9L776.0,811.9L779.3,814.4L780.4,813.9L779.1,813.2L782.6,813.5L782.6,811.0L784.0,814.7L786.7,815.8L788.5,814.8L796.1,820.1L805.9,823.8L808.4,822.8L809.1,824.9L808.7,823.1L812.5,821.8L814.3,825.5L813.3,822.5L818.1,820.7L819.3,822.3L818.1,823.0L821.7,823.1L826.4,830.4L821.5,824.2L822.7,823.7L818.5,820.1L824.0,818.1L827.2,819.5L830.1,817.1L833.8,819.0L837.5,814.7L844.8,815.4L845.6,811.8L847.8,812.1L855.3,818.5L852.9,820.0L854.1,820.3L853.0,823.7L855.0,825.5L852.6,827.2L855.5,826.0L852.9,831.5L854.5,833.8L853.3,840.0L855.2,851.0L854.0,852.5L853.0,851.4L854.1,848.4L850.8,847.0L852.8,844.7L850.9,845.0L849.2,847.2L852.6,847.6L848.2,848.2L849.0,849.5L845.4,854.1L847.5,853.4L847.3,858.5L844.1,859.7L845.8,864.3L842.1,868.9L837.8,868.0L837.3,865.6L833.8,865.5L838.0,867.4L835.4,867.9L836.6,871.1L833.4,872.8L832.8,870.8L834.6,872.2L834.8,869.0L833.2,869.8L829.7,864.3L826.2,865.5L828.2,864.6L831.1,867.0L831.6,872.8L829.8,872.0L829.7,877.4L827.5,878.9L825.5,875.8L825.0,877.4L823.2,876.5L824.2,873.0L822.4,875.8L825.9,879.1L823.1,880.2L824.9,880.8L823.9,883.2L821.7,882.4L823.6,884.1L821.2,885.1L820.5,888.3L816.6,888.2L813.2,883.7L814.0,885.8L806.8,885.8L805.1,884.3L800.7,886.5L799.9,882.2L798.2,881.5L799.9,881.9L799.7,880.1L803.4,882.2L805.4,880.0L804.0,879.1L802.6,880.7L801.5,879.1L800.1,880.3L798.1,877.0L796.8,878.7L798.3,879.4L796.3,879.8L792.5,872.8L790.4,870.7L788.1,871.2L785.1,862.4L782.7,861.5L783.6,860.1L780.4,850.2L787.1,855.7L787.6,858.9L787.2,856.5L791.0,856.8L788.5,856.5L789.6,854.5L787.8,854.7L784.3,849.1L781.7,850.8L782.7,848.0L781.3,843.4L774.4,836.9L777.7,834.5L774.6,836.3L770.5,829.8L771.5,829.1L768.5,820.2L770.7,820.3ZM854.9,797.7L848.1,798.8L847.2,795.0L843.7,792.8L844.2,789.8L841.1,788.9L843.4,787.9L843.5,785.6L846.2,785.0L851.2,791.0L853.9,791.3L852.3,795.4L853.8,794.4L854.9,797.7Z",
  },
]

/** Manifest source names feeding each parliament; the federal record is several. */
const STATE_SOURCE = {
  nsw: /^NSW Parliament/,
  vic: /^Victorian Parliament/,
  sa: /^SA Parliament/,
  qld: /^QLD Parliament/,
}
const FEDERAL_SOURCE = /^Federal Hansard|^Senate committee/

/** Jurisdictions with a state donations file on the money map. */
const MONEY_FILES = new Set(['qld', 'vic'])

const SVG_NS = 'http://www.w3.org/2000/svg'
const STYLE_ID = 'state-map-styles'
const RATIO = MAP_WIDTH / MAP_HEIGHT

const CSS = `
.sm-root { position: relative; height: 100%; container-type: size;
  font-family: var(--sans, system-ui, sans-serif); color: var(--ink, #23271F); }
/* The plate keeps the map's own aspect inside whatever box it is given, so the
   HTML labels (placed in percentages of the plate) sit exactly on their shapes. */
.sm-plate { position: absolute; left: 50%; top: 50%; transform: translate(-50%, -50%);
  width: min(100cqw, calc(100cqh * ${RATIO})); height: min(100cqh, calc(100cqw / ${RATIO})); }
.sm-plate svg { display: block; width: 100%; height: 100%; overflow: visible; }
.sm-state { fill: var(--paper-raised, #fff); stroke: var(--bronze-ink, #8A5A12); stroke-width: 1.1;
  stroke-linejoin: round; vector-effect: non-scaling-stroke; cursor: pointer; outline: none; }
.sm-state:hover, .sm-state[data-active] { fill: var(--bronze-wash, rgba(160, 118, 27, 0.16)); }
.sm-link:focus-visible .sm-state { stroke-width: 2; }
.sm-absent { fill: var(--paper-sunken, #F1EFE8); stroke: var(--line-strong, #8D897B); stroke-width: 0.9; cursor: default; }
.sm-absent:hover, .sm-absent[data-active] { fill: var(--paper-sunken, #F1EFE8); }
.sm-labels { position: absolute; inset: 0; pointer-events: none; }
.sm-label { position: absolute; transform: translate(-50%, -50%); text-align: center; white-space: nowrap;
  text-shadow: 0 0 3px var(--paper, #FAF9F6), 0 0 3px var(--paper, #FAF9F6); }
.sm-label b { display: block; font: 700 0.6875rem/1.2 var(--sans, sans-serif); letter-spacing: 0.08em;
  color: var(--ink-soft, #575C52); }
.sm-label small { display: block; font-size: 0.6875rem; line-height: 1.3; color: var(--ink-faint, #6F7468);
  font-variant-numeric: tabular-nums; }
.sm-label[data-absent] b { color: var(--ink-faint, #6F7468); opacity: 0.7; }
.sm-federal { position: absolute; top: 0; left: 0; z-index: 1; display: grid; gap: 0.1rem;
  max-width: 46%; text-decoration: none; color: inherit;
  text-shadow: 0 0 3px var(--paper, #FAF9F6), 0 0 3px var(--paper, #FAF9F6); }
.sm-federal b { font: 600 0.8125rem/1.3 var(--sans, sans-serif); color: var(--ink, #23271F); }
.sm-federal small { font-size: 0.75rem; line-height: 1.3; color: var(--ink-faint, #6F7468);
  font-variant-numeric: tabular-nums; }
.sm-federal:hover b { color: var(--bronze-ink, #8A5A12); text-decoration: underline;
  text-decoration-color: var(--bronze-ink, #8A5A12); text-underline-offset: 3px; }
.sm-tip { position: absolute; z-index: 2; left: 0; top: 0; width: max-content; min-width: 13rem; max-width: min(16rem, 90%);
  padding: 0.6rem 0.75rem 0.7rem; background: var(--paper-raised, #fff);
  border: 1px solid var(--line, #DFDCD2); border-top: 2px solid var(--bronze, #A0761B); border-radius: 4px; }
.sm-tip-name { display: block; font: 600 0.875rem/1.3 var(--sans, sans-serif); }
.sm-tip-meta { display: block; margin-top: 0.15rem; font-size: 0.75rem; color: var(--ink-faint, #6F7468);
  font-variant-numeric: tabular-nums; }
.sm-tip-actions { display: flex; flex-direction: column; gap: 0.35rem; margin-top: 0.65rem; }
.sm-tip-actions a { display: flex; align-items: center; justify-content: center; padding: 0.45rem 0.75rem;
  border: 1px solid var(--line-strong, #8D897B); border-radius: 4px; text-decoration: none;
  font: 600 0.8125rem/1.3 var(--sans, sans-serif); color: var(--ink, #23271F); }
.sm-tip-actions a:hover { border-color: var(--ink, #23271F); color: var(--ink, #23271F); }
.sm-tip-actions a.sm-primary { background: var(--navy, #142A43); border-color: var(--navy, #142A43); color: var(--on-navy, #fff); }
.sm-tip-actions a.sm-primary:hover { background: var(--navy-raised, #1D3A5C); border-color: var(--navy-raised, #1D3A5C); color: var(--on-navy, #fff); }
@media (prefers-reduced-motion: no-preference) { .sm-state { transition: fill 150ms; } }
@media (max-width: 700px) { .sm-label small { display: none; } .sm-federal { max-width: 60%; } }
`

function injectStyles() {
  if (document.getElementById(STYLE_ID)) return
  const style = document.createElement('style')
  style.id = STYLE_ID
  style.textContent = CSS
  document.head.appendChild(style)
}

function el(tag, className, parent) {
  const node = document.createElement(tag)
  if (className) node.className = className
  parent.appendChild(node)
  return node
}

const fmt = (n) => Number(n).toLocaleString('en-AU')

/**
 * What the manifest says about each parliament: total documents and the
 * span of years across the sources that feed it. A parliament with no source
 * is null - drawn dimmed, "not yet in the record".
 */
function readManifest(manifest) {
  const sources = Array.isArray(manifest?.sources) ? manifest.sources : []
  const summarise = (re) => {
    const hits = sources.filter((s) => re.test(String(s?.name || '')))
    if (!hits.length) return null
    const years = hits.flatMap((s) => String(s.coverage || '').match(/\d{4}/g) || []).map(Number)
    const lo = years.length ? Math.min(...years) : null
    const hi = years.length ? Math.max(...years) : null
    return {
      docs: hits.reduce((sum, s) => sum + (Number(s.docs) || 0), 0),
      coverage: lo === null ? '' : lo === hi ? `${lo}` : `${lo}–${hi}`,
    }
  }
  const states = {}
  for (const [id, re] of Object.entries(STATE_SOURCE)) states[id] = summarise(re)
  return { states, federal: summarise(FEDERAL_SOURCE) }
}

const describe = (info) => [`${fmt(info.docs)} speeches`, info.coverage].filter(Boolean).join(' · ')

export function mountStateMap(container, opts = {}) {
  injectStyles()
  const searchHref = opts.searchHref ?? ((code) => `#/search?state=${encodeURIComponent(code)}`)
  const moneyHref = opts.moneyHref ?? ((jur) => `#/money?jur=${encodeURIComponent(jur)}`)
  const data = readManifest(opts.manifest)

  const root = el('div', 'sm-root', container)

  // The federal record is the whole map, so it is a caption over it, not a shape.
  if (data.federal) {
    const fed = el('a', 'sm-federal', root)
    fed.href = searchHref('federal')
    fed.setAttribute('aria-label', `Federal Parliament: ${describe(data.federal)}. Search its record`)
    el('b', '', fed).textContent = 'Federal Parliament'
    el('small', '', fed).textContent = describe(data.federal)
  }

  const plate = el('div', 'sm-plate', root)
  const svg = document.createElementNS(SVG_NS, 'svg')
  svg.setAttribute('viewBox', `0 0 ${MAP_WIDTH} ${MAP_HEIGHT}`)
  svg.setAttribute('role', 'group')
  svg.setAttribute('aria-label', 'Map of Australia: choose a state parliament to search its record')
  plate.appendChild(svg)
  const labels = el('div', 'sm-labels', plate)
  labels.setAttribute('aria-hidden', 'true')
  const tip = el('div', 'sm-tip', plate)
  tip.setAttribute('role', 'tooltip')
  tip.hidden = true

  const shapes = new Map()
  let active = null

  const place = (state) => {
    const w = plate.clientWidth
    const h = plate.clientHeight
    const x = (state.labelX / MAP_WIDTH) * w
    const y = (state.labelY / MAP_HEIGHT) * h
    const tw = tip.offsetWidth
    const th = tip.offsetHeight
    // Above the label, centred, kept inside the plate; below it when there is no room above.
    const left = Math.min(Math.max(4, x - tw / 2), Math.max(4, w - tw - 4))
    let top = y - th - 22
    if (top < 4) top = Math.min(y + 22, Math.max(4, h - th - 4))
    tip.style.transform = `translate(${Math.round(left)}px, ${Math.round(top)}px)`
  }

  const show = (id) => {
    const state = STATES.find((s) => s.id === id)
    if (!state) return
    if (active) shapes.get(active)?.removeAttribute('data-active')
    active = id
    shapes.get(id)?.setAttribute('data-active', '')
    const info = data.states[id] ?? null
    tip.replaceChildren()
    el('span', 'sm-tip-name', tip).textContent = state.label
    el('span', 'sm-tip-meta', tip).textContent = info ? describe(info) : 'Not yet in the record'
    if (info) {
      const actions = el('span', 'sm-tip-actions', tip)
      const search = el('a', 'sm-primary', actions)
      search.href = searchHref(id)
      search.textContent = 'Search this parliament'
      if (MONEY_FILES.has(id)) {
        const money = el('a', '', actions)
        money.href = moneyHref(id)
        money.textContent = 'State donations'
      }
    }
    tip.hidden = false
    place(state)
  }

  const hide = () => {
    if (active) shapes.get(active)?.removeAttribute('data-active')
    active = null
    tip.hidden = true
  }

  for (const state of STATES) {
    const info = data.states[state.id] ?? null
    const path = document.createElementNS(SVG_NS, 'path')
    path.setAttribute('d', state.path)
    path.classList.add('sm-state')
    if (info) {
      const link = document.createElementNS(SVG_NS, 'a')
      link.setAttribute('href', searchHref(state.id))
      link.classList.add('sm-link')
      link.setAttribute('aria-label', `${state.label}: ${describe(info)}. Search this parliament's record`)
      link.appendChild(path)
      svg.appendChild(link)
      link.addEventListener('focus', () => show(state.id))
      link.addEventListener('blur', hide)
    } else {
      path.classList.add('sm-absent')
      path.setAttribute('role', 'img')
      path.setAttribute('aria-label', `${state.label}: not yet in the record`)
      svg.appendChild(path)
    }
    path.addEventListener('pointerenter', () => show(state.id))
    shapes.set(state.id, path)

    const label = el('div', 'sm-label', labels)
    label.style.left = `${(state.labelX / MAP_WIDTH) * 100}%`
    label.style.top = `${(state.labelY / MAP_HEIGHT) * 100}%`
    el('b', '', label).textContent = state.id.toUpperCase()
    if (info) el('small', '', label).textContent = fmt(info.docs)
    else label.dataset.absent = ''
  }

  // The tip lives inside the root, so the pointer can travel from a state to
  // its links; it goes only when the pointer leaves the whole plate.
  root.addEventListener('pointerleave', hide)
  const onKey = (event) => {
    if (event.key === 'Escape') hide()
  }
  root.addEventListener('keydown', onKey)

  return {
    destroy() {
      root.removeEventListener('pointerleave', hide)
      root.removeEventListener('keydown', onKey)
      root.remove()
    },
  }
}
