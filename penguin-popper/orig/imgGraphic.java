public class imgGraphic{
	java.awt.Image[][] img;
	double start, end;
	int size, frames;
	public imgGraphic (int z, double st, double en, int fr, java.awt.Color[] colors, double downShift, String s){
		size=z;
		start=st;
		end=en;
		frames=fr;
		img=new java.awt.Image[colors.length][frames+1];
		for (int color=0; color<colors.length; color++){
			for (int frame=0; frame<frames+1; frame++){
				java.awt.image.BufferedImage temp=new java.awt.image.BufferedImage(100, 100, java.awt.image.BufferedImage.TYPE_INT_ARGB);
				java.awt.Graphics2D g2=(java.awt.Graphics2D)temp.getGraphics();
				g2.setRenderingHint(java.awt.RenderingHints.KEY_ANTIALIASING, java.awt.RenderingHints.VALUE_ANTIALIAS_ON);
				new graphic(s).draw(g2, 50, 50*(1+downShift), 100, start+frame*(end-start)/frames, false, colors[color]);
				img[color][frame]=temp.getScaledInstance(size, size, java.awt.image.BufferedImage.SCALE_SMOOTH);
			}
		}
	}
	// angle=a1+(a2-a1)/anglesPerRadian*index
	// (angle-a1)/(a2-a1)*anglesPerRadian=index
	public void draw(java.awt.Graphics2D g2, double xc, double yc, double angle, int vColor){
		g2.drawImage(img[vColor][(int)((angle%(2*Math.PI)-start)/(end-start)*frames)], (int)Math.round(xc-size/2), (int)Math.round(yc-size/2), null);
	}
}
