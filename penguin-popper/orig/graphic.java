public class graphic{
		public class point{
			float x, y;
			public point(float xa, float ya){
				x=xa;
				y=ya;
			}
		}
		public class poly{
			point[] point;
			boolean varColor=false;
			java.awt.Color color;
			public void draw(java.awt.Graphics2D g2, double xc, double yc, double scale, double angle, boolean flip){
				if (point.length>2){
					int[] xcoords=new int[point.length], ycoords=new int[point.length];
					for (int i=0; i<point.length; i++){
						double d=dist(point[i].x, point[i].y, 400, 285)/285*scale, a=getAngle(point[i].x, point[i].y, 400, 285)+angle;
						xcoords[i]=(int)(xc-d*Math.cos(a));
						if (flip) xcoords[i]=(int)(2*xc-xcoords[i]);
						ycoords[i]=(int)(yc-d*Math.sin(a));
					}
					g2.setColor(color);
					g2.fillPolygon(xcoords, ycoords, point.length);
				}
			}
			public void draw(java.awt.Graphics2D g2, double xc, double yc, double scale, double angle, boolean flip, java.awt.Color vColor){
				if (point.length>2){
					int[] xcoords=new int[point.length], ycoords=new int[point.length];
					for (int i=0; i<point.length; i++){
						double d=dist(point[i].x, point[i].y, 400, 285)/285*scale, a=getAngle(point[i].x, point[i].y, 400, 285)+angle;
						xcoords[i]=(int)(xc-d*Math.cos(a));
						if (flip) xcoords[i]=(int)(2*xc-xcoords[i]);
						ycoords[i]=(int)(yc-d*Math.sin(a));
					}
					if (varColor) g2.setColor(vColor);
					else g2.setColor(color);
					g2.fillPolygon(xcoords, ycoords, point.length);
				}
			}
			public boolean inside(int x, int y){
				boolean odd=false;
				if (point.length>2){
					int j=point.length-1;
					for (int i=0; i<point.length; i++){
						if (point[i].y<y && point[j].y>=y || point[j].y<y && point[i].y>=y){
							if (point[i].x+(y-point[i].y)/(point[j].y-point[i].y)*(point[j].x-point[i].x)<x) odd=!odd;
						}
						j=i;
					}
				}
				return odd;
			}
			public void scale (double scale){
				for (int i=0; i<point.length; i++){
					double d=dist(point[i].x, point[i].y, 400, 285)/285*scale, a=getAngle(point[i].x, point[i].y, 400, 285);
					point[i].x=(float)(400-d*Math.cos(a));
					point[i].y=(float)(285-d*Math.sin(a));
				}
			}
			public void drawScaled(java.awt.Graphics2D g2, double xc, double yc){
				int[] xcoords=new int[point.length], ycoords=new int[point.length];
				for (int i=0; i<point.length; i++){
					xcoords[i]=(int)(xc-400+point[i].x);
					ycoords[i]=(int)(yc-285+point[i].y);
				}
				g2.setColor(color);
				g2.fillPolygon(xcoords, ycoords, point.length);
			}
		}
		poly[] poly;
		public graphic (String input){
			int polyIndex=0, pointIndex=0;
			String current="", mode="index";
			float x=0;
			for (int i=0; i<input.length()-1; i++){
				if (input.charAt(i)==' '){
					if (mode=="index"){
						poly=new poly[java.lang.Integer.parseInt(current)];
						mode="color";
					} else if (mode=="color"){
						poly[polyIndex]=new poly();
						if (current.charAt(0)=='v') poly[polyIndex].varColor=true;
						else poly[polyIndex].color=new java.awt.Color(java.lang.Integer.parseInt(current));
						polyIndex++;
						mode="points";
					} else if (mode=="points"){
						poly[polyIndex-1].point=new point[java.lang.Integer.parseInt(current)];
						pointIndex=0;
						mode="x";
					} else if (mode=="x"){
						x=java.lang.Float.parseFloat(current);
						mode="y";
					} else if (mode=="y"){
						poly[polyIndex-1].point[pointIndex]=new point(x, java.lang.Float.parseFloat(current));
						pointIndex++;
						mode="x";
					}
					current="";
				} else if (input.charAt(i)==','){
					mode="color";
					current="";
				} else current+=input.charAt(i);
			}
		}
		public void draw(java.awt.Graphics2D g2, double xc, double yc, double scale, double angle, boolean flip){
			for (int i=0; i<poly.length; i++) poly[i].draw(g2, xc, yc, scale, angle, flip);
		}
		public void draw(java.awt.Graphics2D g2, double xc, double yc, double scale, double angle, boolean flip, java.awt.Color vColor){
			for (int i=0; i<poly.length; i++) poly[i].draw(g2, xc, yc, scale, angle, flip, vColor);
		}
		public void drawScaled(java.awt.Graphics2D g2, double xc, double yc){
			for (int i=0; i<poly.length; i++) poly[i].drawScaled(g2, xc, yc);
		}
		public double getAngle(double x1, double y1, double x2, double y2){
			return x2<x1 ? Math.atan((y2-y1)/(x2-x1))+3.1415926536 : Math.atan((y2-y1)/(x2-x1));
		}
		public double dist (double x1, double y1, double x2, double y2){
			return Math.sqrt((x1-x2)*(x1-x2)+(y1-y2)*(y1-y2));
		}
		public void scale(double scale){
			for (int i=0; i<poly.length; i++) poly[i].scale(scale);
		}
	}